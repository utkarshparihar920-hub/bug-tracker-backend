const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/authMiddleware');
const verifyProjectRole = require('../middleware/roleMiddleware');

const {
    addProjectMember,
    getProjectMembers,
    updateMemberRole,
    removeProjectMember
} = require('../controllers/projectMemberController');

// Add a member to a project
router.post(
    '/:projectId/members',
    verifyToken,
    verifyProjectRole(['admin', 'manager']),
    addProjectMember
);

// Get all project members
router.get(
    '/:projectId/members',
    verifyToken,
    verifyProjectRole(['admin', 'manager', 'developer', 'viewer']),
    getProjectMembers
);

// Update a member's role
router.put(
    '/:projectId/members/:userId',
    verifyToken,
    verifyProjectRole(['admin']),
    updateMemberRole
);

// Remove a project member
router.delete(
    '/:projectId/members/:userId',
    verifyToken,
    verifyProjectRole(['admin', 'manager']),
    removeProjectMember
);

module.exports = router;