import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { H, Handlers } from '@highlight-run/node';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env['PORT'] || 3000;

const highlightConfig = {
  projectID: 'jdk55qvd',
  serviceName: '2pa.ms',
  environment: process.env['NODE_ENV'] || 'development',
  serviceVersion: 'git-sha',
};

H.init(highlightConfig);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(Handlers.middleware(highlightConfig));

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/http*', async (req: Request, res: Response) => {
  H.log('http', 'test');

  const headers = {
    'User-Agent':
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/80.0.345.0 Safari/537.36',
  };

  const url = `http${req.params[0]}`;

  if (!url) {
    return res.sendStatus(404);
  }

  const site = await fetch(url, {
    headers,
  });

  const body = await site.text();

  return res.send(body);
});

app.use(Handlers.errorHandler(highlightConfig));

// Start server
app.listen(PORT, () => {
  console.info(`🚀 Server is running on port ${PORT}`);
  console.info(`📝 Environment: ${process.env['NODE_ENV'] || 'development'}`);
  console.info(`🔗 Health check: http://localhost:${PORT}/health`);
});
