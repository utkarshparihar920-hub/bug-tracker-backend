require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const pool = require('./config/db');

// Import routes
const userRoutes = require('./routes/userRoutes');
const projectRoutes = require('./routes/projectRoutes');
const projectMemberRoutes = require('./routes/projectMemberRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const commentRoutes = require('./routes/commentRoutes');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/projects', projectMemberRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/comments', commentRoutes);

// Home route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Bug Tracker API is running!'
  });
});

// PostgreSQL connection test
app.get('/api/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS current_time');

    res.json({
      success: true,
      message: 'Supabase PostgreSQL connected successfully!',
      databaseTime: result.rows[0].current_time
    });
  } catch (error) {
    console.error('Database test failed:', error.message);

    res.status(500).json({
      success: false,
      message: 'Database connection failed!'
    });
  }
});

// Database tables test
app.get('/api/tables-test', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN (
        'users',
        'projects',
        'project_members',
        'tickets',
        'comments'
      )
      ORDER BY table_name;
    `);

    res.json({
      success: true,
      message: 'Database tables verified successfully!',
      tables: result.rows.map(row => row.table_name)
    });
  } catch (error) {
    console.error('Tables test failed:', error.message);

    res.status(500).json({
      success: false,
      message: 'Database tables verification failed!'
    });
  }
});

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});