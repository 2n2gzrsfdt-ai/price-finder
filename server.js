import http from 'node:http';
import worker from './worker.js';

const server = http.createServer(async (req, res) => {
  try {
    if (!['GET', 'OPTIONS'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, OPTIONS' });
      res.end(); return;
    }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') url.pathname = '/health';
    const env = { ...process.env };
    if (url.pathname === '/api/rakuten') {
      url.pathname = '/api/search';
      delete env.YAHOO_APP_ID;
    }
    const response = await worker.fetch(new Request(url, { method: req.method }), env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Internal server error' }));
  }
});
server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('PRICE FINDER API listening'));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
