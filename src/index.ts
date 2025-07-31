import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env['PORT'] || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/*', async (req: Request, res: Response) => {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/80.0.345.0 Safari/537.36',
  };

  const url = req.params[0];

  if (!url) {
    return res.sendStatus(404);
  }

  const site = await fetch(url, {
    headers,
  });

  const body = await site.text();

  return res.send(body);
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
  console.info(`🚀 Server is running on port ${PORT}`);
  console.info(`📝 Environment: ${process.env['NODE_ENV'] || 'development'}`);
  console.info(`🔗 Health check: http://localhost:${PORT}/health`);
});
