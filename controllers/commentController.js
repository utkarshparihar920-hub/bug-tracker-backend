const pool = require('../config/db');

const isValidUUID = (value) => {
    return typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
};

// Verify that a ticket belongs to the requested project
const verifyTicket = async (projectId, ticketId) => {
    const result = await pool.query(
        `SELECT id
         FROM tickets
         WHERE project_id = $1 AND id = $2`,
        [projectId, ticketId]
    );

    return result.rows.length > 0;
};

// Add a comment to a ticket
const addComment = async (req, res) => {
    try {
        const { projectId, ticketId } = req.params;
        const { text, parentCommentId } = req.body;
        const userId = req.user.userId;

        if (!isValidUUID(ticketId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ticket ID!'
            });
        }

        if (typeof text !== 'string' || !text.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Comment text is required!'
            });
        }

        if (!(await verifyTicket(projectId, ticketId))) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found in this project!'
            });
        }

        if (parentCommentId !== undefined && parentCommentId !== null) {
            if (!isValidUUID(parentCommentId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid parent comment ID!'
                });
            }

            const parentResult = await pool.query(
                `SELECT id
                 FROM comments
                 WHERE id = $1 AND ticket_id = $2`,
                [parentCommentId, ticketId]
            );

            if (parentResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Parent comment not found!'
                });
            }
        }

        const result = await pool.query(
            `INSERT INTO comments
                (ticket_id, user_id, parent_comment_id, text)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [ticketId, userId, parentCommentId || null, text.trim()]
        );

        return res.status(201).json({
            success: true,
            message: 'Comment added successfully!',
            comment: result.rows[0]
        });

    } catch (error) {
        console.error('Add comment error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Failed to add comment!'
        });
    }
};

// Get all comments for a ticket
const getComments = async (req, res) => {
    try {
        const { projectId, ticketId } = req.params;

        if (!isValidUUID(ticketId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ticket ID!'
            });
        }

        if (!(await verifyTicket(projectId, ticketId))) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found in this project!'
            });
        }

        const result = await pool.query(
            `SELECT
                c.*,
                u.name AS user_name
             FROM comments c
             INNER JOIN users u ON c.user_id = u.id
             WHERE c.ticket_id = $1
             ORDER BY c.created_at ASC`,
            [ticketId]
        );

        return res.status(200).json({
            success: true,
            count: result.rows.length,
            comments: result.rows
        });

    } catch (error) {
        console.error('Get comments error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Failed to fetch comments!'
        });
    }
};

// Update a comment
const updateComment = async (req, res) => {
    try {
        const { projectId, ticketId, commentId } = req.params;
        const { text } = req.body;
        const userId = req.user.userId;

        if (!isValidUUID(ticketId) || !isValidUUID(commentId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ticket or comment ID!'
            });
        }

        if (typeof text !== 'string' || !text.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Comment text is required!'
            });
        }

        if (!(await verifyTicket(projectId, ticketId))) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found in this project!'
            });
        }

        const result = await pool.query(
            `UPDATE comments
             SET text = $1, updated_at = NOW()
             WHERE id = $2
               AND ticket_id = $3
               AND user_id = $4
             RETURNING *`,
            [text.trim(), commentId, ticketId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Comment not found or you are not authorized to edit it!'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Comment updated successfully!',
            comment: result.rows[0]
        });

    } catch (error) {
        console.error('Update comment error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Failed to update comment!'
        });
    }
};

// Delete a comment
const deleteComment = async (req, res) => {
    let client;
    let transactionStarted = false;

    try {
        const { projectId, ticketId, commentId } = req.params;
        const userId = req.user.userId;

        if (!isValidUUID(ticketId) || !isValidUUID(commentId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ticket or comment ID!'
            });
        }

        if (!(await verifyTicket(projectId, ticketId))) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found in this project!'
            });
        }

        client = await pool.connect();

        await client.query('BEGIN');
        transactionStarted = true;

        const commentResult = await client.query(
            `SELECT id
             FROM comments
             WHERE id = $1
               AND ticket_id = $2
               AND user_id = $3
             FOR UPDATE`,
            [commentId, ticketId, userId]
        );

        if (commentResult.rows.length === 0) {
            await client.query('ROLLBACK');
            transactionStarted = false;

            return res.status(404).json({
                success: false,
                message: 'Comment not found or you are not authorized to delete it!'
            });
        }

        // Preserve replies by making direct replies top-level comments.
        await client.query(
            `UPDATE comments
             SET parent_comment_id = NULL
             WHERE parent_comment_id = $1`,
            [commentId]
        );

        await client.query(
            `DELETE FROM comments
             WHERE id = $1 AND ticket_id = $2 AND user_id = $3`,
            [commentId, ticketId, userId]
        );

        await client.query('COMMIT');
        transactionStarted = false;

        return res.status(200).json({
            success: true,
            message: 'Comment deleted successfully!'
        });

    } catch (error) {
        if (client && transactionStarted) {
            await client.query('ROLLBACK');
        }

        console.error('Delete comment error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Failed to delete comment!'
        });

    } finally {
        if (client) {
            client.release();
        }
    }
};

module.exports = {
    addComment,
    getComments,
    updateComment,
    deleteComment
};