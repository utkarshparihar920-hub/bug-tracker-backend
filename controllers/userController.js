const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Register User
const registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body || {};

        // Validate required fields
        if (
            typeof name !== 'string' ||
            typeof email !== 'string' ||
            typeof password !== 'string' ||
            !name.trim() ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: 'Name, email and password are required!'
            });
        }

        const cleanName = name.trim();
        const cleanEmail = email.trim().toLowerCase();

        // Validate name
        if (cleanName.length > 100) {
            return res.status(400).json({
                success: false,
                message: 'Name cannot exceed 100 characters!'
            });
        }

        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(cleanEmail) || cleanEmail.length > 255) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid email address!'
            });
        }

        // Validate password
        if (password.length < 8 || password.length > 72) {
            return res.status(400).json({
                success: false,
                message: 'Password must be between 8 and 72 characters!'
            });
        }

        // Check whether email already exists
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [cleanEmail]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Email already registered!'
            });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);

        // Create user
        const result = await pool.query(
            `INSERT INTO users (name, email, password_hash)
             VALUES ($1, $2, $3)
             RETURNING id, name, email, created_at`,
            [cleanName, cleanEmail, passwordHash]
        );

        return res.status(201).json({
            success: true,
            message: 'User registered successfully!',
            user: result.rows[0]
        });

    } catch (error) {
        console.error('Registration error:', error.message);

        // Handle duplicate email in case of simultaneous registrations
        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                message: 'Email already registered!'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'User registration failed!'
        });
    }
};

// Login User
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body || {};

        if (
            typeof email !== 'string' ||
            typeof password !== 'string' ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required!'
            });
        }

        const cleanEmail = email.trim().toLowerCase();

        // Find user
        const result = await pool.query(
            `SELECT id, name, email, password_hash
             FROM users
             WHERE email = $1`,
            [cleanEmail]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password!'
            });
        }

        const user = result.rows[0];

        // Compare password
        const isPasswordValid = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password!'
            });
        }

        if (!process.env.JWT_SECRET) {
            console.error('JWT_SECRET is not configured!');

            return res.status(500).json({
                success: false,
                message: 'Authentication configuration error!'
            });
        }

        // Generate JWT
        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.status(200).json({
            success: true,
            message: 'Login successful!',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Login error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Login failed!'
        });
    }
};

module.exports = {
    registerUser,
    loginUser
};