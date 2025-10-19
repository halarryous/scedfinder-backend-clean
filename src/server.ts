import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import db from './db';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: true, // Allow all origins temporarily to fix CORS issue
  credentials: true,
}));
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply rate limiting
app.use(limiter);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await db.raw('SELECT 1');
    res.status(200).json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      version: '1.0.0',
      database: 'connected'
    });
  } catch (error) {
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
    
    let query = db('sced_course_details').select('course_code', 'course_code_description', 'course_description', 'course_subject_area', 'course_level', 'cte_indicator');
    
    if (search) {
      query = query.where('course_code_description', 'ilike', `%${search}%`)
                   .orWhere('course_description', 'ilike', `%${search}%`)
                   .orWhere('course_code', 'ilike', `%${search}%`);
    }
    
    const data = await query.limit(Number(limit)).offset(offset);
    const total = await query.clone().clearSelect().clearOrder().count('* as count').first();
    
    res.json({
      success: true,
      data: data.map(course => ({
        id: course.course_code,
        ...course
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number(total?.count || 0),
        totalPages: Math.ceil(Number(total?.count || 0) / Number(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: 'Failed to search SCED courses' }
    });
  }
});

app.get('/api/v1/certifications/search', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    
    let query = db('course_certification_mappings')
      .select('certification_area_code as code', 'certification_area_description as name')
      .distinct();
    
    if (search && search !== '*') {
      query = query.where('certification_area_description', 'ilike', `%${search}%`);
    }
    
    const data = await query.limit(Number(limit)).offset(offset);
    const total = await query.clone().clearSelect().clearOrder().count('* as count').first();
    
    res.json({
      success: true,
      data: data.map(item => ({
        ...item,
        course_count: '0' // Placeholder
      })),
      total: Number(total?.count || 0),
      page: Number(page),
      limit: Number(limit)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: 'Failed to search certifications' }
    });
  }
});

// Get CTE courses for a specific certification
app.get('/api/v1/certifications/name/:name/cte-courses', async (req, res) => {
  try {
    const { name } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    
    // Find courses related to this certification
    let query = db('course_certification_mappings')
      .join('sced_course_details', 'course_certification_mappings.course_code', 'sced_course_details.course_code')
      .select(
        'sced_course_details.course_code',
        'sced_course_details.course_code_description',
        'sced_course_details.course_description',
        'sced_course_details.course_subject_area',
        'sced_course_details.course_level',
        'sced_course_details.cte_indicator'
      )
      .where('course_certification_mappings.certification_area_description', decodeURIComponent(name))
      .andWhere('sced_course_details.cte_indicator', 'Yes');
    
    const data = await query.limit(Number(limit)).offset(offset);
    const total = await query.clone().clearSelect().clearOrder().count('* as count').first();
    
    res.json({
      success: true,
      data: data.map(course => ({
        id: course.course_code,
        ...course
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number(total?.count || 0),
        totalPages: Math.ceil(Number(total?.count || 0) / Number(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: 'Failed to load CTE courses for certification' }
    });
  }
});

// Get course details by course code
app.get('/api/v1/sced/courses/code/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    const course = await db('sced_course_details')
      .select('*')
      .where('course_code', code)
      .first();
    
    if (!course) {
      return res.status(404).json({
        success: false,
        error: { message: 'Course not found' }
      });
    }
    
    // Get related certifications
    const certifications = await db('course_certification_mappings')
      .select('certification_area_code', 'certification_area_description')
      .where('course_code', code);
    
    res.json({
      success: true,
      data: {
        id: course.course_code,
        ...course,
        certifications: certifications.map(cert => cert.certification_area_description)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: 'Failed to load course details' }
    });
  }
});

// Database setup endpoint (for initial setup)
app.post('/api/v1/setup', async (req, res) => {
  try {
    // Create tables
    await db.raw(`
      CREATE TABLE IF NOT EXISTS sced_course_details (
        course_code VARCHAR(20) PRIMARY KEY,
        course_code_description VARCHAR(500),
        course_description TEXT,
        course_subject_area VARCHAR(200),
        course_level VARCHAR(50),
        cte_indicator VARCHAR(10)
      );
    `);

    await db.raw(`
      CREATE TABLE IF NOT EXISTS course_certification_mappings (
        id SERIAL PRIMARY KEY,
        course_code VARCHAR(20),
        certification_area_code VARCHAR(20),
        certification_area_description VARCHAR(500)
      );
    `);

    // Insert sample data (only if tables are empty)
    const existingCourses = await db('sced_course_details').count('* as count').first();
    
    if (Number(existingCourses?.count) === 0) {
      await db('sced_course_details').insert([
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

      await db('course_certification_mappings').insert([
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
  } catch (error) {
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
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
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

export default app;