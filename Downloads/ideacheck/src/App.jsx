import React, { useState } from 'react';

const VERDICTS = {
  exists: { label: 'Already exists', cls: 'bad' },
  partly_exists: { label: 'Partly exists', cls: 'mid' },
  not_found: { label: 'Nothing close found', cls: 'good' },
};

async function post(path, payload) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let data = {};
  try { data = await r.json(); } catch { /* ignore */ }
  if (!r.ok || data.error) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}

function List({ items }) {
  if (!items?.length) return <p className="muted">Nothing listed.</p>;
  return <ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
}

function Links({ keywords, idea }) {
  const q = encodeURIComponent((keywords?.length ? keywords.slice(0, 5).join(' ') : idea).slice(0, 200));
  const links = [
    ['Google Patents', `https://patents.google.com/?q=${q}`],
    ['Espacenet', `https://worldwide.espacenet.com/patent/search?q=${q}`],
    ['InPASS (India)', 'https://iprsearch.ipindia.gov.in/PublicSearch/'],
    ['Google', `https://www.google.com/search?q=${q}`],
    ['Product Hunt', `https://www.producthunt.com/search?q=${q}`],
  ];
  return (
    <div className="chips">
      {links.map(([n, u]) => <a key={n} href={u} target="_blank" rel="noreferrer">{n} ↗</a>)}
    </div>
  );
}

export default function App() {
  const [idea, setIdea] = useState('');
  const [market, setMarket] = useState('India');
  const [audience, setAudience] = useState('');
  const [accessCode, setAccessCode] = useState(() => {
    try { return localStorage.getItem('ic_code') || ''; } catch { return ''; }
  });
  const [step, setStep] = useState(0); // 0 idle, 1 searching, 2 writing, 3 done
  const [error, setError] = useState('');
  const [mkt, setMkt] = useState(null);
  const [pat, setPat] = useState(null);
  const [report, setReport] = useState(null);
  const [warn, setWarn] = useState('');

  async function run(e) {
    e.preventDefault();
    setError(''); setWarn(''); setReport(null); setMkt(null); setPat(null);
    try { localStorage.setItem('ic_code', accessCode); } catch { /* ignore */ }
    const base = { idea, market, audience, accessCode };
    setStep(1);
    try {
      const [m, p] = await Promise.allSettled([post('/api/market', base), post('/api/patents', base)]);
      if (m.status === 'rejected' && p.status === 'rejected') throw m.reason;
      const mv = m.status === 'fulfilled' ? m.value : null;
      const pv = p.status === 'fulfilled' ? p.value : null;
      if (!mv || !pv) setWarn(`One search failed (${(m.reason || p.reason).message}). The report is based on partial evidence.`);
      setMkt(mv); setPat(pv);
      setStep(2);
      const rep = await post('/api/report', { ...base, marketResult: mv, patentResult: pv });
      setReport(rep);
      setStep(3);
    } catch (err) {
      setError(err.message);
      setStep(0);
    }
  }

  const busy = step === 1 || step === 2;
  const v = report && (VERDICTS[report.verdict] || VERDICTS.partly_exists);
  const sources = [...(mkt?.sources || []), ...(pat?.sources || [])];

  return (
    <main>
      <header>
        <h1>Idea Check</h1>
        <p className="muted">Does it already exist? Is it patented? What should you change? A fast, honest screening, not legal advice.</p>
      </header>

      <form onSubmit={run}>
        <label>Your idea
          <textarea value={idea} onChange={(e) => setIdea(e.target.value)} rows={5} maxLength={2000}
            placeholder="Describe what it does, who it is for, and how it makes money." required />
        </label>
        <div className="row">
          <label>Target market
            <select value={market} onChange={(e) => setMarket(e.target.value)}>
              <option>India</option><option>USA</option><option>Global</option>
            </select>
          </label>
          <label>Target users (optional)
            <input value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={300} placeholder="e.g. small electronics factories" />
          </label>
          <label>Access code (if required)
            <input value={accessCode} onChange={(e) => setAccessCode(e.target.value)} type="password" autoComplete="off" />
          </label>
        </div>
        <button disabled={busy || idea.trim().length < 10}>{busy ? 'Checking…' : 'Check my idea'}</button>
      </form>

      {busy && (
        <div className="progress" role="status">
          <span className={step >= 1 ? 'on' : ''}>1. Searching products, startups and patents</span>
          <span className={step >= 2 ? 'on' : ''}>2. Writing the verdict</span>
          <p className="muted">This takes about 30 to 60 seconds.</p>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {warn && <p className="warn">{warn}</p>}

      {report && (
        <section className="report">
          <div className={`verdict ${v.cls}`}>
            <div>
              <strong>{v.label}</strong>
              <span> · confidence {report.confidence || 'low'}</span>
            </div>
            {typeof report.score === 'number' && <div className="score">{Math.round(report.score)}<small>/100</small></div>}
          </div>
          <h2>{report.headline}</h2>
          <p>{report.whatExists}</p>

          <h3>Closest existing products</h3>
          {mkt?.competitors?.length ? (
            <div className="cards">
              {mkt.competitors.map((c, i) => (
                <div className="card" key={i}>
                  <div className="cardhead">
                    {c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.name}</a> : <b>{c.name}</b>}
                    <span className={`tag ${c.closeness}`}>{c.closeness}</span>
                  </div>
                  <p>{c.what}</p>
                  {c.pricing && <p className="muted">Pricing: {c.pricing}</p>}
                  {c.notes && <p className="muted">Gap: {c.notes}</p>}
                </div>
              ))}
            </div>
          ) : <p className="muted">No close matches found in this search. That is not proof nothing exists.</p>}
          {mkt?.searchNotes && <p className="muted small">{mkt.searchNotes}</p>}

          <h3>What they miss</h3><List items={report.gaps} />
          <h3>Changes that could make it work</h3><List items={report.changesToMake} />
          <h3>Risks</h3><List items={report.risks} />

          <h3>Patent view</h3>
          <p>{report.patentView}</p>
          {pat?.patents?.length > 0 && (
            <div className="cards">
              {pat.patents.map((p, i) => (
                <div className="card" key={i}>
                  <div className="cardhead">
                    {p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.title || p.number}</a> : <b>{p.title}</b>}
                    <span className={`tag ${p.closeness}`}>{p.closeness}</span>
                  </div>
                  {p.number && <p className="muted">{p.number}</p>}
                  <p>{p.relevance}</p>
                </div>
              ))}
            </div>
          )}
          {pat?.searchNotes && <p className="muted small">{pat.searchNotes}</p>}

          <h3>Cheap next steps</h3><List items={report.nextSteps} />

          <h3>Verify it yourself</h3>
          <Links keywords={pat?.keywords} idea={idea} />

          {sources.length > 0 && (
            <details>
              <summary>Sources ({sources.length})</summary>
              <ul>{sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>
            </details>
          )}
          <p className="muted small">{report.honestyNotes} This is a screening aid built on web search, not a full patent search and not legal advice. Confirm with a patent agent before relying on it.</p>
        </section>
      )}
    </main>
  );
}
