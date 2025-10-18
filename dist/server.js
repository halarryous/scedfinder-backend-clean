"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = __importDefault(require("./db"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4000;
// Rate limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
});
// Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.NODE_ENV === 'production'
        ? process.env.CORS_ORIGINS?.split(',') || ['https://your-frontend.vercel.app']
        : ['http://localhost:3000'],
    credentials: true,
}));
app.use((0, compression_1.default)());
app.use((0, morgan_1.default)('combined'));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Apply rate limiting
app.use(limiter);
// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        // Test database connection
        await db_1.default.raw('SELECT 1');
        res.status(200).json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV,
            version: '1.0.0',
            database: 'connected'
        });
    }
    catch (error) {
        res.status(500).json({
            status: 'ERROR',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV,
            version: '1.0.0',
            database: 'disconnected',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// API Routes
app.get('/api/v1/sced/search', async (req, res) => {
    try {
        const { search = '', page = 1, limit = 20 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        let query = (0, db_1.default)('sced_course_details').select('*');
        if (search) {
            query = query.where('course_code_description', 'ilike', `%${search}%`)
                .orWhere('course_description', 'ilike', `%${search}%`)
                .orWhere('course_code', 'ilike', `%${search}%`);
        }
        const data = await query.limit(Number(limit)).offset(offset);
        const total = await query.clone().clearSelect().clearOrder().count('* as count').first();
        res.json({
            success: true,
            data,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: Number(total?.count || 0),
                totalPages: Math.ceil(Number(total?.count || 0) / Number(limit))
            }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: { message: 'Failed to search SCED courses' }
        });
    }
});
app.get('/api/v1/certifications/search', async (req, res) => {
    try {
        const { search = '' } = req.query;
        let query = (0, db_1.default)('course_certification_mappings')
            .select('certification_area_code', 'certification_area_description')
            .distinct();
        if (search) {
            query = query.where('certification_area_description', 'ilike', `%${search}%`);
        }
        const data = await query;
        res.json({
            success: true,
            data
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: { message: 'Failed to search certifications' }
        });
    }
});
// Database setup endpoint (for initial setup)
app.post('/api/v1/setup', async (req, res) => {
    try {
        // Create tables
        await db_1.default.raw(`
      CREATE TABLE IF NOT EXISTS sced_course_details (
        course_code VARCHAR(20) PRIMARY KEY,
        course_code_description VARCHAR(500),
        course_description TEXT,
        course_subject_area VARCHAR(200),
        course_level VARCHAR(50),
        cte_indicator VARCHAR(10)
      );
    `);
        await db_1.default.raw(`
      CREATE TABLE IF NOT EXISTS course_certification_mappings (
        id SERIAL PRIMARY KEY,
        course_code VARCHAR(20),
        certification_area_code VARCHAR(20),
        certification_area_description VARCHAR(500)
      );
    `);
        // Insert sample data (only if tables are empty)
        const existingCourses = await (0, db_1.default)('sced_course_details').count('* as count').first();
        if (Number(existingCourses?.count) === 0) {
            await (0, db_1.default)('sced_course_details').insert([
                {
                    course_code: '03001',
                    course_code_description: 'Biology',
                    course_description: 'This course provides students with a comprehensive study of living organisms and life processes.',
                    course_subject_area: 'Science',
                    course_level: 'High School',
                    cte_indicator: 'No'
                },
                {
                    course_code: '20114',
                    course_code_description: 'Introduction to Agriculture',
                    course_description: 'This course introduces students to the world of agriculture and its career opportunities.',
                    course_subject_area: 'Agriculture, Food & Natural Resources',
                    course_level: 'High School',
                    cte_indicator: 'Yes'
                },
                {
                    course_code: '21101',
                    course_code_description: 'Automotive Technology I',
                    course_description: 'This course introduces students to automotive systems and basic repair procedures.',
                    course_subject_area: 'Transportation, Distribution & Logistics',
                    course_level: 'High School',
                    cte_indicator: 'Yes'
                }
            ]);
            await (0, db_1.default)('course_certification_mappings').insert([
                { course_code: '03001', certification_area_code: '5010', certification_area_description: 'Biology (Grades 5-9)' },
                { course_code: '03001', certification_area_code: '5020', certification_area_description: 'Biology (Grades 7-12)' },
                { course_code: '20114', certification_area_code: '8010', certification_area_description: 'Agriculture (Grades 5-9)' },
                { course_code: '21101', certification_area_code: '9010', certification_area_description: 'Technology Education (Grades 5-9)' }
            ]);
        }
        res.json({
            success: true,
            message: 'Database setup completed successfully'
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: { message: 'Failed to setup database' }
        });
    }
});
// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: { message: 'Route not found' }
    });
});
// Error handler
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
    });
});
// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});
exports.default = app;
