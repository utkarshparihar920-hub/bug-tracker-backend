const pool = require('../config/db');

const validRoles = ['admin', 'manager', 'developer', 'viewer'];

const isValidUUID = (value) => {
    return typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
};

// Check whether the user has the required role in a project
const verifyProjectRole = (allowedRoles) => {
    return async (req, res, next) => {
        try {
            const projectId = req.params.projectId || req.params.id;
            const userId = req.user?.userId;

            if (!projectId) {
                return res.status(400).json({
                    success: false,
                    message: 'Project ID is required!'
                });
            }

            if (!isValidUUID(projectId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid project ID!'
                });
            }

            if (!isValidUUID(userId)) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid authenticated user!'
                });
            }

            if (
                !Array.isArray(allowedRoles) ||
                allowedRoles.length === 0 ||
                !allowedRoles.every(role => validRoles.includes(role))
            ) {
                return res.status(500).json({
                    success: false,
                    message: 'Invalid role configuration!'
                });
            }

            const result = await pool.query(
                `SELECT role
                 FROM project_members
                 WHERE project_id = $1 AND user_id = $2`,
                [projectId, userId]
            );

            if (result.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not a member of this project!'
                });
            }

            const userRole = result.rows[0].role;

            if (!allowedRoles.includes(userRole)) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to perform this action!'
                });
            }

            req.projectRole = userRole;

            return next();

        } catch (error) {
            console.error('Role verification error:', error.message);

            return res.status(500).json({
                success: false,
                message: 'Role verification failed!'
            });
        }
    };
};

module.exports = verifyProjectRole;