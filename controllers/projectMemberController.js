const pool = require('../config/db');

const allowedRoles = ['admin', 'manager', 'developer', 'viewer'];

const isValidUUID = (value) => {
    return typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
};

// Add a member to a project
const addProjectMember = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { userId, role } = req.body;

        if (!isValidUUID(userId)) {
            return res.status(400).json({
                success: false,
                message: 'A valid user ID is required!'
            });
        }

        if (!allowedRoles.includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid project role!'
            });
        }

        // Managers cannot assign admin or manager roles.
        if (
            req.projectRole === 'manager' &&
            !['developer', 'viewer'].includes(role)
        ) {
            return res.status(403).json({
                success: false,
                message: 'Managers can only add developers or viewers!'
            });
        }

        const result = await pool.query(
            `INSERT INTO project_members (project_id, user_id, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (project_id, user_id) DO NOTHING
             RETURNING *`,
            [projectId, userId, role]
        );

        if (result.rows.length === 0) {
            return res.status(409).json({
                success: false,
                message: 'User is already a project member!'
            });
        }

        return res.status(201).json({
            success: true,
            message: 'Project member added successfully!',
            member: result.rows[0]
        });

    } catch (error) {
        console.error('Add project member error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Failed to add project member!'
        });
    }
};

// Get all members of a project
const getProjectMembers = async (req, res) => {
    try {
        const { projectId } = req.params;

        const result = await pool.query(
            `SELECT
                pm.project_id,
                pm.user_id,
                pm.role,
                pm.joined_at,
                u.name,
                u.email
             FROM project_members pm
             INNER JOIN users u ON pm.user_id = u.id
             WHERE pm.project_id = $1
             ORDER BY pm.joined_at ASC`,
            [projectId]
        );

        return res.status(200).json({
            success: true,
            count: result.rows.length,
            members: result.rows
        });

    } catch (error) {
        console.error('Get project members error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Failed to fetch project members!'
        });
    }
};

// Update a member's role
const updateMemberRole = async (req, res) => {
    try {
        const { projectId, userId } = req.params;
        const { role } = req.body;

        if (!isValidUUID(userId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID!'
            });
        }

        if (!allowedRoles.includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'A valid project role is required!'
            });
        }

        const ownerResult = await pool.query(
            'SELECT owner_id FROM projects WHERE id = $1',
            [projectId]
        );

        if (ownerResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Project not found!'
            });
        }

        if (ownerResult.rows[0].owner_id === userId) {
            return res.status(403).json({
                success: false,
                message: 'The project owner role cannot be changed!'
            });
        }

        const result = await pool.query(
            `UPDATE project_members
             SET role = $1
             WHERE project_id = $2 AND user_id = $3
             RETURNING *`,
            [role, projectId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Project member not found!'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Member role updated successfully!',
            member: result.rows[0]
        });

    } catch (error) {
        console.error('Update member role error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Failed to update member role!'
        });
    }
};

// Remove a member from a project
const removeProjectMember = async (req, res) => {
    const client = await pool.connect();
    let transactionStarted = false;

    try {
        const { projectId, userId } = req.params;

        if (!isValidUUID(userId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID!'
            });
        }

        await client.query('BEGIN');
        transactionStarted = true;

        const memberResult = await client.query(
            `SELECT pm.role, p.owner_id
             FROM project_members pm
             INNER JOIN projects p ON p.id = pm.project_id
             WHERE pm.project_id = $1 AND pm.user_id = $2
             FOR UPDATE OF pm`,
            [projectId, userId]
        );

        if (memberResult.rows.length === 0) {
            await client.query('ROLLBACK');
            transactionStarted = false;

            return res.status(404).json({
                success: false,
                message: 'Project member not found!'
            });
        }

        const member = memberResult.rows[0];

        if (member.owner_id === userId) {
            await client.query('ROLLBACK');
            transactionStarted = false;

            return res.status(403).json({
                success: false,
                message: 'The project owner cannot be removed!'
            });
        }

        // Managers cannot remove admins or other managers.
        if (
            req.projectRole === 'manager' &&
            ['admin', 'manager'].includes(member.role)
        ) {
            await client.query('ROLLBACK');
            transactionStarted = false;

            return res.status(403).json({
                success: false,
                message: 'Managers cannot remove admins or other managers!'
            });
        }

        // Unassign the member from their project tickets first.
        await client.query(
            `UPDATE tickets
             SET assignee_id = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE project_id = $1 AND assignee_id = $2`,
            [projectId, userId]
        );

        await client.query(
            `DELETE FROM project_members
             WHERE project_id = $1 AND user_id = $2`,
            [projectId, userId]
        );

        await client.query('COMMIT');
        transactionStarted = false;

        return res.status(200).json({
            success: true,
            message: 'Project member removed successfully!'
        });

    } catch (error) {
        if (transactionStarted) {
            await client.query('ROLLBACK');
        }

        console.error('Remove project member error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Failed to remove project member!'
        });

    } finally {
        client.release();
    }
};

module.exports = {
    addProjectMember,
    getProjectMembers,
    updateMemberRole,
    removeProjectMember
};