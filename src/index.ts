import express, { Request, Response } from 'express';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env['PORT'] || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic route
app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'Welcome to 2pams API',
    timestamp: new Date().toISOString(),
    environment: process.env['NODE_ENV'] || 'development',
  });
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env['NODE_ENV'] || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});
