# SCED Finder Backend - Clean Deployment

Simple Express.js backend for SCED & Certification Search Tool.

## Quick Deploy to Render

1. Connect this GitHub repository to Render
2. Use Docker deployment
3. Set environment variables in Render dashboard
4. Deploy!

## Environment Variables
- `NODE_ENV=production`
- `PORT=4000`
- `CORS_ORIGINS=https://your-frontend.vercel.app`

## API Endpoints
- `GET /health` - Health check
- `GET /api/v1/sced/search` - Mock SCED search
- `GET /api/v1/certifications/search` - Mock certification search