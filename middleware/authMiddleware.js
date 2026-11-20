const jwt = require('jsonwebtoken');

const isValidUUID = (value) => {
    return typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
};

const verifyToken = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided!'
            });
        }

        const token = authHeader.slice(7).trim();

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided!'
            });
        }

        if (!process.env.JWT_SECRET) {
            console.error('JWT_SECRET is not configured!');

            return res.status(500).json({
                success: false,
                message: 'Authentication configuration error!'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (!decoded || !isValidUUID(decoded.userId)) {
            return res.status(401).json({
                success: false,
                message: 'Invalid authentication token!'
            });
        }

        req.user = decoded;

        return next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token!'
        });
    }
};

module.exports = verifyToken;