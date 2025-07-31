import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import basex from 'base-x';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env['PORT'] || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const db: Array<string> = [];

const base62 = basex(
  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
);

// Basic route
app.get('/:shortUrl', (req: Request, res: Response) => {
  const shortUrl = req.params['shortUrl'];
  if (typeof shortUrl === 'string') {
    const index = base62.decode(shortUrl);
    const key = new TextDecoder().decode(index);
    res.send(db[parseInt(key)]);
  }
});

// URL Shortener endpoint
app.get('/shorten/:url', (req: Request, res: Response) => {
  const { url } = req.params;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  db.push(url);
  const shortUrl = base62.encode(
    new TextEncoder().encode((db.length - 1).toString())
  );
  return res.status(200).send(shortUrl);
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
