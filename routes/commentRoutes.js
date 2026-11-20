const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/authMiddleware');
const verifyProjectRole = require('../middleware/roleMiddleware');

const {
    addComment,
    getComments,
    updateComment,
    deleteComment
} = require('../controllers/commentController');

// Add a comment to a ticket
router.post(
    '/:projectId/:ticketId',
    verifyToken,
    verifyProjectRole(['admin', 'manager', 'developer']),
    addComment
);

// Get all comments for a ticket
router.get(
    '/:projectId/:ticketId',
    verifyToken,
    verifyProjectRole(['admin', 'manager', 'developer', 'viewer']),
    getComments
);

// Update a comment
router.put(
    '/:projectId/:ticketId/:commentId',
    verifyToken,
    verifyProjectRole(['admin', 'manager', 'developer', 'viewer']),
    updateComment
);

// Delete a comment
router.delete(
    '/:projectId/:ticketId/:commentId',
    verifyToken,
    verifyProjectRole(['admin', 'manager', 'developer', 'viewer']),
    deleteComment
);

module.exports = router;