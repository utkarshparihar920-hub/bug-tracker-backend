const pool = require('../config/db');

const isValidUUID = (value) => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
};

// Create a new project
const createProject = async (req, res) => {
    let client;
    let transactionStarted = false;

    try {
        const { title, description } = req.body;
        const ownerId = req.user.userId;

        if (typeof title !== 'string' || !title.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Project title is required!'
            });
        }

        if (
            description !== undefined &&
            description !== null &&
            typeof description !== 'string'
        ) {
            return res.status(400).json({
                success: false,
                message: 'Project description must be text!'
            });
        }

        client = await pool.connect();

        await client.query('BEGIN');
        transactionStarted = true;

        const projectResult = await client.query(
            `INSERT INTO projects (title, description, owner_id)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [title.trim(), description || null, ownerId]
        );

        const project = projectResult.rows[0];

        // Add the project owner as an admin member
        await client.query(
            `INSERT INTO project_members (project_id, user_id, role)
             VALUES ($1, $2, $3)`,
            [project.id, ownerId, 'admin']
        );

        await client.query('COMMIT');
        transactionStarted = false;

        res.status(201).json({
            success: true,
            message: 'Project created successfully!',
            project
        });

    } catch (error) {
        if (client && transactionStarted) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('Project creation rollback error:', rollbackError.message);
            }
        }

        console.error('Create project error:', error.message);

        res.status(500).json({
            success: false,
            message: 'Project creation failed!'
        });

    } finally {
        if (client) {
            client.release();
        }
    }
};

// Get all projects for the logged-in user
const getProjects = async (req, res) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(
            `SELECT p.*, pm.role
             FROM projects p
             INNER JOIN project_members pm
             ON p.id = pm.project_id
             WHERE pm.user_id = $1
             ORDER BY p.created_at DESC`,
            [userId]
        );

        res.status(200).json({
            success: true,
            count: result.rows.length,
            projects: result.rows
        });

    } catch (error) {
        console.error('Get projects error:', error.message);

        res.status(500).json({
            success: false,
            message: 'Failed to fetch projects!'
        });
    }
};

// Get a single project
const getProjectById = async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = req.user.userId;

        if (!isValidUUID(projectId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid project ID!'
            });
        }

        const result = await pool.query(
            `SELECT p.*, pm.role
             FROM projects p
             INNER JOIN project_members pm
             ON p.id = pm.project_id
             WHERE p.id = $1 AND pm.user_id = $2`,
            [projectId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Project not found or access denied!'
            });
        }

        res.status(200).json({
            success: true,
            project: result.rows[0]
        });

    } catch (error) {
        console.error('Get project error:', error.message);

        res.status(500).json({
            success: false,
            message: 'Failed to fetch project!'
        });
    }
};

// Update a project
const updateProject = async (req, res) => {
    try {
        const projectId = req.params.projectId;
        const { title, description } = req.body;

        if (!isValidUUID(projectId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid project ID!'
            });
        }

        if (title === undefined && description === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Provide a title or description to update!'
            });
        }

        if (title !== undefined &&
            (typeof title !== 'string' || !title.trim())) {
            return res.status(400).json({
                success: false,
                message: 'Project title must be valid text!'
            });
        }

        if (
            description !== undefined &&
            description !== null &&
            typeof description !== 'string'
        ) {
            return res.status(400).json({
                success: false,
                message: 'Project description must be text!'
            });
        }

        const values = [];
        const updates = [];

        if (title !== undefined) {
            values.push(title.trim());
            updates.push(`title = $${values.length}`);
        }

        if (description !== undefined) {
            values.push(description);
            updates.push(`description = $${values.length}`);
        }

        updates.push('updated_at = NOW()');

        values.push(projectId);

        const result = await pool.query(
            `UPDATE projects
             SET ${updates.join(', ')}
             WHERE id = $${values.length}
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Project not found!'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Project updated successfully!',
            project: result.rows[0]
        });

    } catch (error) {
        console.error('Update project error:', error.message);

        res.status(500).json({
            success: false,
            message: 'Project update failed!'
        });
    }
};

// Delete a project
const deleteProject = async (req, res) => {
    let client;
    let transactionStarted = false;

    try {
        const projectId = req.params.projectId;

        if (!isValidUUID(projectId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid project ID!'
            });
        }

        client = await pool.connect();

        await client.query('BEGIN');
        transactionStarted = true;

        // Delete comments belonging to the project's tickets
        await client.query(
            `DELETE FROM comments
             WHERE ticket_id IN (
                 SELECT id FROM tickets WHERE project_id = $1
             )`,
            [projectId]
        );

        // Delete project tickets
        await client.query(
            'DELETE FROM tickets WHERE project_id = $1',
            [projectId]
        );

        // Delete project members
        await client.query(
            'DELETE FROM project_members WHERE project_id = $1',
            [projectId]
        );

        // Delete the project
        const result = await client.query(
            'DELETE FROM projects WHERE id = $1 RETURNING id',
            [projectId]
        );

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            transactionStarted = false;

            return res.status(404).json({
                success: false,
                message: 'Project not found!'
            });
        }

        await client.query('COMMIT');
        transactionStarted = false;

        res.status(200).json({
            success: true,
            message: 'Project deleted successfully!'
        });

    } catch (error) {
        if (client && transactionStarted) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('Project deletion rollback error:', rollbackError.message);
            }
        }

        console.error('Delete project error:', error.message);

        res.status(500).json({
            success: false,
            message: 'Project deletion failed!'
        });

    } finally {
        if (client) {
            client.release();
        }
    }
};

module.exports = {
    createProject,
    getProjects,
    getProjectById,
    updateProject,
    deleteProject
};