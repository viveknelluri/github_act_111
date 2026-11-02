// Shared helpers for all API routes. Files starting with "_" are not exposed as routes on Vercel.

const API_URL = 'https://api.anthropic.com/v1/messages';
export const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

export const LIMITS = { idea: 2000, audience: 300 };

// ---------- request guards ----------
const hits = new Map(); // best-effort, per warm instance only

function clientIp(req) {
  const xf = req.headers?.['x-forwarded-for'];
  return (Array.isArray(xf) ? xf[0] : xf || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

function rateLimited(req, endpoint) {
  const max = parseInt(process.env.RATE_LIMIT_PER_HOUR || '12', 10);
  const key = `${endpoint}:${clientIp(req)}`;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

/** Returns parsed body, or null if it already sent an error response. */
export async function guard(req, res, endpoint) {
  if (req.method !== 'POST') { send(res, 405, { error: 'Use POST.' }); return null; }
  if (!process.env.ANTHROPIC_API_KEY) {
    send(res, 500, { error: 'Server is missing ANTHROPIC_API_KEY.' });
    return null;
  }
  const body = await readBody(req);
  const code = process.env.APP_ACCESS_CODE;
  if (code && body.accessCode !== code) {
    send(res, 401, { error: 'Access code is missing or wrong.' });
    return null;
  }
  if (rateLimited(req, endpoint)) {
    send(res, 429, { error: 'Too many checks from your network. Try again later.' });
    return null;
  }
  return body;
}

export function cleanInput(body) {
  const idea = String(body.idea || '').trim().slice(0, LIMITS.idea);
  const market = ['India', 'USA', 'Global'].includes(body.market) ? body.market : 'Global';
  const audience = String(body.audience || '').trim().slice(0, LIMITS.audience);
  return { idea, market, audience };
}

export function fail(res, err) {
  console.error('[ideacheck]', err?.message || err);
  const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 502;
  send(res, status === 401 ? 502 : status, {
    error: status === 429
      ? 'The AI service is busy. Please retry in a minute.'
      : 'Something went wrong while contacting the AI service.',
  });
}

export const ok = (res, body) => send(res, 200, body);

// ---------- Claude call ----------
export async function callClaude({ system, user, tools, maxTokens = 3000 }) {
  const messages = [{ role: 'user', content: user }];
  const allContent = [];

  for (let turn = 0; turn < 4; turn++) {
    const r = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL(),
        max_tokens: maxTokens,
        system,
        messages,
        ...(tools ? { tools } : {}),
      }),
    });

    if (!r.ok) {
      const text = await r.text().catch(() => '');
      const e = new Error(`Anthropic ${r.status}: ${text.slice(0, 300)}`);
      e.status = r.status;
      throw e;
    }
    const data = await r.json();
    allContent.push(...(data.content || []));

    if (data.stop_reason === 'pause_turn') {
      // send the paused response back unchanged to let it continue
      messages.push({ role: 'assistant', content: data.content });
      continue;
    }
    break;
  }

  const text = allContent.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return { text, content: allContent, sources: collectSources(allContent) };
}

export function collectSources(content) {
  const seen = new Map();
  for (const b of content) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content) {
        if (r.type === 'web_search_result' && r.url && !seen.has(r.url)) {
          seen.set(r.url, { title: r.title || r.url, url: r.url });
        }
      }
    }
  }
  return [...seen.values()].slice(0, 25);
}

export function searchErrors(content) {
  return content
    .filter((b) => b.type === 'web_search_tool_result' && b.content && b.content.type === 'web_search_tool_result_error')
    .map((b) => b.content.error_code);
}

export function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf('{');
    const end = c.lastIndexOf('}');
    if (start === -1 || end <= start) continue;
    try { return JSON.parse(c.slice(start, end + 1)); } catch { /* try next */ }
  }
  return null;
}

export const webSearchTool = (extra = {}) => ({
  type: 'web_search_20250305',
  name: 'web_search',
  ...extra,
});
