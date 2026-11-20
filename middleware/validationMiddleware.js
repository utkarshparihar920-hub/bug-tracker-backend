const validateFields = (requiredFields) => {
    return (req, res, next) => {
        if (!Array.isArray(requiredFields)) {
            return res.status(500).json({
                success: false,
                message: 'Invalid validation configuration!'
            });
        }

        if (
            !req.body ||
            typeof req.body !== 'object' ||
            Array.isArray(req.body)
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid request body!'
            });
        }

        const missingFields = requiredFields.filter((field) => {
            const value = req.body[field];

            return (
                value === undefined ||
                value === null ||
                (typeof value === 'string' && !value.trim())
            );
        });

        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Required fields are missing!',
                missingFields
            });
        }

        return next();
    };
};

module.exports = validateFields;