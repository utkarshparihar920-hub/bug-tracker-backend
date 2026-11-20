const pool = require('../config/db');

const allowedTypes = ['bug', 'feature_request', 'task'];
const allowedPriorities = ['low', 'medium', 'high', 'critical'];
const allowedStatuses = ['to_do', 'in_progress', 'done'];

const isValidUUID = (value) => {
    return typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
};

// Check whether an assigned user belongs to the project
const isProjectMember = async (projectId, userId) => {
    const result = await pool.query(
        `SELECT 1
         FROM project_members
         WHERE project_id = $1 AND user_id = $2`,
        [projectId, userId]
    );

    return result.rows.length > 0;
};

// Create a new ticket
const createTicket = async (req, res) => {
    try {
        const { projectId } = req.params;
        const {
            title,
            description,
            type,
            priority,
            assigneeId
        } = req.body;

        const reporterId = req.user.userId;

        if (typeof title !== 'string' || !title.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Ticket title is required!'
            });
        }

        if (
            description !== undefined &&
            description !== null &&
            typeof description !== 'string'
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ticket description!'
            });
        }

        if (type !== undefined && !allowedTypes.includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ticket type!'
            });
        }

        if (priority !== undefined && !allowedPriorities.includes(priority)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ticket priority!'
            });
        }

        if (assigneeId !== undefined && assigneeId !== null) {
            if (!isValidUUID(assigneeId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid assignee ID!'
                });
            }

            if (!(await isProjectMember(projectId, assigneeId))) {
                return res.status(400).json({
                    success: false,
                    message: 'Assignee must be a member of this project!'
                });
            }
        }

        const result = await pool.query(
            `INSERT INTO tickets
                (project_id, reporter_id, assignee_id, title, description, type, priority)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                projectId,
                reporterId,
                assigneeId || null,
                title.trim(),
                description ?? null,
                type || 'bug',
                priority || 'medium'
            ]
        );

        return res.status(201).json({
            success: true,
            message: 'Ticket created successfully!',
            ticket: result.rows[0]
        });

    } catch (error) {
        console.error('Create ticket error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Ticket creation failed!'
        });
    }
};

// Get all tickets in a project
const getTickets = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { status, priority, type, assigneeId, search } = req.query;

        if (status && !allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ticket status filter!'
            });
        }

        if (priority && !allowedPriorities.includes(priority)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ticket priority filter!'
            });
        }

        if (type && !allowedTypes.includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ticket type filter!'
            });
        }

        if (assigneeId && !isValidUUID(assigneeId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid assignee ID!'
            });
        }

        if (search !== undefined && typeof search !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Invalid search value!'
            });
        }

        const values = [projectId];

        let query = `
            SELECT
                t.*,
                reporter.name AS reporter_name,
                assignee.name AS assignee_name
            FROM tickets t
            INNER JOIN users reporter ON t.reporter_id = reporter.id
            LEFT JOIN users assignee ON t.assignee_id = assignee.id
            WHERE t.project_id = $1
        `;

        if (status) {
            values.push(status);
            query += ` AND t.status = $${values.length}`;
        }

        if (priority) {
            values.push(priority);
            query += ` AND t.priority = $${values.length}`;
        }

        if (type) {
            values.push(type);
            query += ` AND t.type = $${values.length}`;
        }

        if (assigneeId) {
            values.push(assigneeId);
            query += ` AND t.assignee_id = $${values.length}`;
        }

        if (search && search.trim()) {
            values.push(`%${search.trim()}%`);
            query += `
                AND (
                    t.title ILIKE $${values.length}
                    OR t.description ILIKE $${values.length}
                )
            `;
        }

        query += ' ORDER BY t.created_at DESC';

        const result = await pool.query(query, values);

        return res.status(200).json({
            success: true,
            count: result.rows.length,
            tickets: result.rows
        });

    } catch (error) {
        console.error('Get tickets error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Failed to fetch tickets!'
        });
    }
};

// Get a single ticket
const getTicketById = async (req, res) => {
    try {
        const { projectId, ticketId } = req.params;

        if (!isValidUUID(ticketId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ticket ID!'
            });
        }

        const result = await pool.query(
            `SELECT
                t.*,
                reporter.name AS reporter_name,
                assignee.name AS assignee_name
             FROM tickets t
             INNER JOIN users reporter ON t.reporter_id = reporter.id
             LEFT JOIN users assignee ON t.assignee_id = assignee.id
             WHERE t.project_id = $1 AND t.id = $2`,
            [projectId, ticketId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found!'
            });
        }

        return res.status(200).json({
            success: true,
            ticket: result.rows[0]
        });

    } catch (error) {
        console.error('Get ticket error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Failed to fetch ticket!'
        });
    }
};

// Update a ticket
const updateTicket = async (req, res) => {
    try {
        const { projectId, ticketId } = req.params;

        const {
            title,
            description,
            type,
            priority,
            assigneeId
        } = req.body;

        if (!isValidUUID(ticketId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ticket ID!'
            });
        }

        if (title !== undefined &&
            (typeof title !== 'string' || !title.trim())) {
            return res.status(400).json({
                success: false,
                message: 'Ticket title cannot be empty!'
            });
        }

        if (
            description !== undefined &&
            description !== null &&
            typeof description !== 'string'
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ticket description!'
            });
        }

        if (type !== undefined && !allowedTypes.includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ticket type!'
            });
        }

        if (priority !== undefined && !allowedPriorities.includes(priority)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ticket priority!'
            });
        }

        if (
            title === undefined &&
            description === undefined &&
            type === undefined &&
            priority === undefined &&
            assigneeId === undefined
        ) {
            return res.status(400).json({
                success: false,
                message: 'Provide at least one field to update!'
            });
        }

        if (assigneeId !== undefined && assigneeId !== null) {
            if (!isValidUUID(assigneeId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid assignee ID!'
                });
            }

            if (!(await isProjectMember(projectId, assigneeId))) {
                return res.status(400).json({
                    success: false,
                    message: 'Assignee must be a member of this project!'
                });
            }
        }

        const fields = [];
        const values = [];

        const addField = (column, value) => {
            values.push(value);
            fields.push(`${column} = $${values.length}`);
        };

        if (title !== undefined) addField('title', title.trim());
        if (description !== undefined) addField('description', description);
        if (type !== undefined) addField('type', type);
        if (priority !== undefined) addField('priority', priority);
        if (assigneeId !== undefined) addField('assignee_id', assigneeId);

        values.push(projectId);
        const projectIndex = values.length;

        values.push(ticketId);
        const ticketIndex = values.length;

        const result = await pool.query(
            `UPDATE tickets
             SET ${fields.join(', ')}, updated_at = NOW()
             WHERE project_id = $${projectIndex} AND id = $${ticketIndex}
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found!'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Ticket updated successfully!',
            ticket: result.rows[0]
        });

    } catch (error) {
        console.error('Update ticket error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Ticket update failed!'
        });
    }
};

// Update ticket status
const updateTicketStatus = async (req, res) => {
    try {
        const { projectId, ticketId } = req.params;
        const { status } = req.body;

        if (!isValidUUID(ticketId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ticket ID!'
            });
        }

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ticket status!'
            });
        }

        const result = await pool.query(
            `UPDATE tickets
             SET status = $1, updated_at = NOW()
             WHERE project_id = $2 AND id = $3
             RETURNING *`,
            [status, projectId, ticketId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found!'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Ticket status updated successfully!',
            ticket: result.rows[0]
        });

    } catch (error) {
        console.error('Update ticket status error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Ticket status update failed!'
        });
    }
};

// Delete a ticket
const deleteTicket = async (req, res) => {
    let client;
    let transactionStarted = false;

    try {
        const { projectId, ticketId } = req.params;

        if (!isValidUUID(ticketId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ticket ID!'
            });
        }

        client = await pool.connect();

        await client.query('BEGIN');
        transactionStarted = true;

        const ticketResult = await client.query(
            `SELECT id
             FROM tickets
             WHERE project_id = $1 AND id = $2
             FOR UPDATE`,
            [projectId, ticketId]
        );

        if (ticketResult.rows.length === 0) {
            await client.query('ROLLBACK');
            transactionStarted = false;

            return res.status(404).json({
                success: false,
                message: 'Ticket not found!'
            });
        }

        await client.query(
            'DELETE FROM comments WHERE ticket_id = $1',
            [ticketId]
        );

        await client.query(
            'DELETE FROM tickets WHERE project_id = $1 AND id = $2',
            [projectId, ticketId]
        );

        await client.query('COMMIT');
        transactionStarted = false;

        return res.status(200).json({
            success: true,
            message: 'Ticket deleted successfully!'
        });

    } catch (error) {
        if (client && transactionStarted) {
            await client.query('ROLLBACK');
        }

        console.error('Delete ticket error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Ticket deletion failed!'
        });

    } finally {
        if (client) {
            client.release();
        }
    }
};

module.exports = {
    createTicket,
    getTickets,
    getTicketById,
    updateTicket,
    deleteTicket,
    updateTicketStatus
};