import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import multer from 'multer';
import csvParser from 'csv-parser';
import fs from 'fs';
import path from 'path';
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

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

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

// CSV Upload endpoint
app.post('/api/v1/admin/upload-csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { message: 'No file uploaded' }
      });
    }

    const filePath = req.file.path;
    const uploadType = req.body.type || 'general';
    let recordsProcessed = 0;

    // Determine file type based on headers or filename
    const results: any[] = [];
    
    // Read CSV file
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (data) => {
          results.push(data);
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (results.length === 0) {
      throw new Error('No data found in CSV file');
    }

    // Check first row to determine file type
    const firstRow = results[0];
    const hasCourseCertMapping = 'Certification Area Code' in firstRow || 'certification_area_code' in firstRow;
    
    if (hasCourseCertMapping) {
      // This is a course-certification mapping file
      console.log('Processing course-certification mapping file...');
      
      for (const row of results) {
        const courseCode = row['Course Code (Course ID)'] || row['course_code'];
        const certAreaCode = row['Certification Area Code'] || row['certification_area_code'];
        const certAreaDesc = row['Certification Area Description'] || row['certification_area_description'];
        
        if (courseCode && certAreaCode && certAreaDesc) {
          try {
            // Check if this mapping already exists
            const existing = await db('course_certification_mappings')
              .where({
                course_code: courseCode,
                certification_area_code: certAreaCode
              })
              .first();
            
            if (!existing) {
              await db('course_certification_mappings').insert({
                course_code: courseCode,
                certification_area_code: certAreaCode,
                certification_area_description: certAreaDesc
              });
              recordsProcessed++;
            }
          } catch (insertError) {
            console.warn('Insert error for mapping:', insertError instanceof Error ? insertError.message : 'Unknown error');
          }
        }
      }
    } else {
      // This is a SCED course details file
      console.log('Processing SCED course details file...');
      
      for (const row of results) {
        const courseCode = row['Course Code (Course ID)'] || row['course_code'];
        const courseDesc = row['Course Code Description'] || row['course_code_description'];
        const fullDesc = row['Course Description'] || row['course_description'];
        const subjectArea = row['Course Subject Area'] || row['course_subject_area'];
        const courseLevel = row['Course Level'] || row['course_level'];
        const cteIndicator = row['CTE Indicator'] || row['CTE_IND'] || row['cte_indicator'];
        
        if (courseCode && courseDesc) {
          try {
            // Check if course already exists
            const existing = await db('sced_course_details')
              .where('course_code', courseCode)
              .first();
            
            if (!existing) {
              await db('sced_course_details').insert({
                course_code: courseCode,
                course_code_description: courseDesc,
                course_description: fullDesc,
                course_subject_area: subjectArea,
                course_level: courseLevel,
                cte_indicator: cteIndicator
              });
              recordsProcessed++;
            }
          } catch (insertError) {
            console.warn('Insert error for course:', insertError instanceof Error ? insertError.message : 'Unknown error');
          }
        }
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: `Successfully processed ${recordsProcessed} records`,
      recordsProcessed
    });

  } catch (error) {
    console.error('CSV upload error:', error);
    
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      error: { message: error instanceof Error ? error.message : 'Failed to process CSV file' }
    });
  }
});

// Database stats endpoint
app.get('/api/v1/admin/stats', async (req, res) => {
  try {
    // Get course count
    const courseResult = await db('sced_course_details').count('* as count').first();
    const totalCourses = Number(courseResult?.count || 0);
    
    // Get mapping count
    const mappingResult = await db('course_certification_mappings').count('* as count').first();
    const totalMappings = Number(mappingResult?.count || 0);
    
    // Get distinct certifications count using raw query
    const certResult = await db.raw(`
      SELECT COUNT(DISTINCT certification_area_description) as count 
      FROM course_certification_mappings
    `);
    const totalCertifications = Number(certResult.rows?.[0]?.count || 0);

    res.json({
      success: true,
      data: {
        totalCourses,
        totalCertifications,
        totalMappings
      }
    });
  } catch (error) {
    console.error('Stats endpoint error:', error);
    res.status(500).json({
      success: false,
      error: { message: `Failed to load database stats: ${error instanceof Error ? error.message : 'Unknown error'}` }
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

    // Add unique constraint if it doesn't exist
    try {
      await db.raw(`
        ALTER TABLE course_certification_mappings 
        ADD CONSTRAINT unique_course_cert 
        UNIQUE (course_code, certification_area_code)
      `);
    } catch (constraintError) {
      // Constraint might already exist, ignore error
      console.log('Constraint may already exist:', constraintError instanceof Error ? constraintError.message : 'Unknown error');
    }

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