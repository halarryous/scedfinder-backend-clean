import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

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
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.CORS_ORIGINS?.split(',') || ['https://your-frontend.vercel.app']
    : ['http://localhost:3000'],
  credentials: true,
}));
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply rate limiting
app.use(limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: '1.0.0'
  });
});

// API Routes
app.get('/api/v1/sced/search', (req, res) => {
  res.json({
    success: true,
    data: [
      {
        id: "test-1",
        course_code: "03001",
        course_code_description: "Biology",
        course_subject_area: "Science",
        cte_indicator: "No"
      }
    ],
    pagination: {
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1
    }
  });
});

app.get('/api/v1/certifications/search', (req, res) => {
  res.json({
    success: true,
    data: [
      {
        certification_area_code: "5010",
        certification_area_description: "Biology (Grades 5-9)"
      }
    ]
  });
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