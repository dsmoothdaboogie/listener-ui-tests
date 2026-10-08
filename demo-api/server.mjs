// Mock API for the reference app, reached through the Angular dev-server proxy
// (proxy.conf.json). It has to be a real server: Playwright and Cypress only see
// requests that reach the network, so an in-app HttpClient fake would leave
// generated response waits with nothing to wait for.
import { createServer } from 'node:http';

const PORT = Number(process.env.DEMO_API_PORT ?? 4300);
const LATENCY_MS = 50;

const deals = [
  { id: '10001', name: 'Harbor Logistics refinancing', currency: 'USD', desk: 'credit', closeDate: null, confidential: false, status: 'Live' },
  { id: '10002', name: 'Northwind bond issue', currency: 'EUR', desk: 'dcm', closeDate: null, confidential: false, status: 'Draft' },
  { id: '10003', name: 'Contoso term loan', currency: 'GBP', desk: 'credit', closeDate: null, confidential: true, status: 'Live' },
];
let nextId = 10042;

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  const one = /^\/api\/deals\/([^/]+)$/.exec(path);
  await new Promise((r) => setTimeout(r, LATENCY_MS));

  if (req.method === 'GET' && path === '/api/deals') return send(res, 200, deals);
  if (req.method === 'GET' && one) {
    const deal = deals.find((d) => d.id === one[1]);
    return deal ? send(res, 200, deal) : send(res, 404, { error: 'not found' });
  }
  if (req.method === 'POST' && path === '/api/deals') {
    const body = JSON.parse((await readBody(req)) || '{}');
    // Masked fields (tax id, PIN) are accepted and dropped, as a real API would not echo them.
    const deal = {
      id: String(nextId++),
      name: String(body.name ?? ''),
      currency: String(body.currency ?? 'USD'),
      desk: String(body.desk ?? 'credit'),
      closeDate: body.closeDate ?? null,
      confidential: Boolean(body.confidential),
      status: 'Draft',
    };
    deals.push(deal);
    return send(res, 201, deal);
  }
  send(res, 404, { error: 'not found' });
});

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

server.listen(PORT, () => console.log(`demo-api listening on http://localhost:${PORT}`));
