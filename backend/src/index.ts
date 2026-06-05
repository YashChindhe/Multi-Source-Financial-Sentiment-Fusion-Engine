import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { runAgentLoop, initializeDatabase } from './agent';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;
const FRONTEND_URL = process.env.FRONTEND_URL || '*';

// Configure standard CORS
app.use(cors({
  origin: FRONTEND_URL === '*' ? '*' : FRONTEND_URL.split(','),
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Initialize Database connection (Neon Postgres)
initializeDatabase();

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// SSE Streaming Endpoint for Real-time ReAct logs & calculations
app.get('/api/stream', async (req, res) => {
  const ticker = (req.query.ticker as string || 'AAPL').toUpperCase().trim();

  // Establish SSE Header configs
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    // Always include CORS headers in SSE requests
    'Access-Control-Allow-Origin': FRONTEND_URL === '*' ? '*' : FRONTEND_URL
  });

  // Keep-alive heartbeat to prevent timeouts
  const heartbeatInterval = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sendEvent('status', { message: 'CONNECTED', ticker });
    
    // Execute ReAct Agent Loop
    const result = await runAgentLoop(ticker, sendEvent);
    
    // Send final merged payload
    sendEvent('result', result);
  } catch (error: any) {
    console.error(`Error streaming for ticker ${ticker}:`, error);
    sendEvent('error', { message: error.message || 'Internal Agent execution failed.' });
  } finally {
    clearInterval(heartbeatInterval);
    res.end();
  }
});

// Listen on the dynamic PORT
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Fusion Engine Backend is actively running on http://0.0.0.0:${PORT}`);
  console.log(`Configured FRONTEND_URL: ${FRONTEND_URL}`);
});
