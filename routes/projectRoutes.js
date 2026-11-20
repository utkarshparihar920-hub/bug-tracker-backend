const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/authMiddleware');
const verifyProjectRole = require('../middleware/roleMiddleware');

const {
    createProject,
    getProjects,
    getProjectById,
    updateProject,
    deleteProject
} = require('../controllers/projectController');

// Create a project
router.post('/', verifyToken, createProject);

// Get all projects for the logged-in user
router.get('/', verifyToken, getProjects);

// Get a single project
router.get('/:id', verifyToken, getProjectById);

// Update a project (admin or manager)
router.put(
    '/:projectId',
    verifyToken,
    verifyProjectRole(['admin', 'manager']),
    updateProject
);

// Delete a project (admin only)
router.delete(
    '/:projectId',
    verifyToken,
    verifyProjectRole(['admin']),
    deleteProject
);

module.exports = router;