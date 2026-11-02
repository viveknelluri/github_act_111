// Tests the API handlers against a mocked Anthropic API (no network, no key needed).
import assert from 'node:assert/strict';

process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.APP_ACCESS_CODE = 'sesame';
process.env.RATE_LIMIT_PER_HOUR = '50';

const calls = [];
let script = [];
globalThis.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  calls.push({ url, headers: opts.headers, body });
  const next = script.shift();
  return { ok: true, status: 200, json: async () => next, text: async () => JSON.stringify(next) };
};

function mockRes() {
  return { statusCode: 200, headers: {}, body: '', setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
}
const req = (body, method = 'POST') => ({ method, headers: { 'x-forwarded-for': '1.2.3.4' }, body });
const json = (r) => JSON.parse(r.body);

const { default: market } = await import('../api/market.js');
const { default: patents } = await import('../api/patents.js');
const { default: report } = await import('../api/report.js');

const idea = 'A SaaS for small electronics factories to build MES workflows without code';

// guards
let r = mockRes(); await market(req({ idea }, 'GET'), r); assert.equal(r.statusCode, 405);
r = mockRes(); await market(req({ idea }), r); assert.equal(r.statusCode, 401);

// market: pause_turn loop, JSON in a code fence, sources collected
script = [
  { stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'mes saas' } }] },
  { stop_reason: 'end_turn', content: [
    { type: 'web_search_tool_result', tool_use_id: 's1', content: [{ type: 'web_search_result', url: 'https://example.com/a', title: 'A' }] },
    { type: 'text', text: '```json\n{"competitors":[{"name":"A","url":"https://example.com/a","what":"x","closeness":"partial"}],"searchNotes":"ok"}\n```' },
  ] },
];
r = mockRes(); await market(req({ idea, market: 'India', accessCode: 'sesame' }), r);
assert.equal(r.statusCode, 200);
let d = json(r);
assert.equal(d.competitors[0].name, 'A');
assert.equal(d.sources[0].url, 'https://example.com/a');
assert.equal(calls.length, 2, 'pause_turn should trigger a second call');
assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
assert.equal(calls[0].headers['x-api-key'], 'test-key');
assert.equal(calls[0].body.tools[0].type, 'web_search_20250305');

// patents: domain filter present, search error surfaced
calls.length = 0;
script = [{ stop_reason: 'end_turn', content: [
  { type: 'web_search_tool_result', tool_use_id: 'x', content: { type: 'web_search_tool_result_error', error_code: 'unavailable' } },
  { type: 'text', text: '{"patents":[],"searchNotes":"none found in this search","keywords":["mes"]}' },
] }];
r = mockRes(); await patents(req({ idea, accessCode: 'sesame' }), r);
d = json(r);
assert.ok(calls[0].body.tools[0].allowed_domains.includes('patents.google.com'));
assert.match(d.searchNotes, /unavailable/);

// report: no tools, valid JSON returned; bad JSON -> error
calls.length = 0;
script = [{ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"verdict":"partly_exists","confidence":"medium","score":55,"headline":"h"}' }] }];
r = mockRes(); await report(req({ idea, accessCode: 'sesame', marketResult: { a: 1 } }), r);
assert.equal(json(r).verdict, 'partly_exists');
assert.equal(calls[0].body.tools, undefined);
script = [{ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }];
r = mockRes(); await report(req({ idea, accessCode: 'sesame' }), r);
assert.equal(r.statusCode, 502);

// short idea rejected, key never leaked in responses
r = mockRes(); await report(req({ idea: 'hi', accessCode: 'sesame' }), r);
assert.ok(json(r).error);
assert.ok(!r.body.includes('test-key'));

console.log('All handler tests passed');
