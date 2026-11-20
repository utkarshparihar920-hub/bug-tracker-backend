const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/authMiddleware');
const verifyProjectRole = require('../middleware/roleMiddleware');

const {
    createTicket,
    getTickets,
    getTicketById,
    updateTicket,
    deleteTicket,
    updateTicketStatus
} = require('../controllers/ticketController');

// Create a ticket
router.post(
    '/:projectId',
    verifyToken,
    verifyProjectRole(['admin', 'manager', 'developer']),
    createTicket
);

// Get tickets for a project
router.get(
    '/:projectId',
    verifyToken,
    verifyProjectRole(['admin', 'manager', 'developer', 'viewer']),
    getTickets
);

// Get a single ticket
router.get(
    '/:projectId/:ticketId',
    verifyToken,
    verifyProjectRole(['admin', 'manager', 'developer', 'viewer']),
    getTicketById
);

// Update a ticket
router.put(
    '/:projectId/:ticketId',
    verifyToken,
    verifyProjectRole(['admin', 'manager', 'developer']),
    updateTicket
);

// Update ticket status
router.patch(
    '/:projectId/:ticketId/status',
    verifyToken,
    verifyProjectRole(['admin', 'manager', 'developer']),
    updateTicketStatus
);

// Delete a ticket
router.delete(
    '/:projectId/:ticketId',
    verifyToken,
    verifyProjectRole(['admin', 'manager']),
    deleteTicket
);

module.exports = router;