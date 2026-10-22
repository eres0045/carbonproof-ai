import { useEffect, useMemo, useState } from 'react';
import { EMISSION_FACTORS, CATEGORY_KEYS } from './data/emissionFactors.js';
import {
  appendRecord, verifyChain, seedChain, totalsByCategory, totalCo2eKg,
} from './lib/ledger.js';
import { analyzeClaim } from './lib/claimChecker.js';

const STORAGE_KEY = 'carbonproof-ai-chain-v1';

function loadChain() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch { /* fall through to seed */ }
  return seedChain();
}

function fmtKg(kg) {
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} t CO2e`;
  return `${kg.toLocaleString('en-IN')} kg CO2e`;
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [chain, setChain] = useState(loadChain);
  const [tab, setTab] = useState('dashboard');
  const [verifyResult, setVerifyResult] = useState(null);
  const [tamperMode, setTamperMode] = useState(false);
  const [claim, setClaim] = useState('We are proud to announce that our company is now 100% carbon neutral and eco-friendly!');
  const [claimResult, setClaimResult] = useState(null);
  const [form, setForm] = useState({
    organization: '', category: 'electricity', quantity: '', date: '', evidence: '',
  });
  const [formMsg, setFormMsg] = useState('');

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(chain)); } catch { /* storage unavailable */ }
  }, [chain]);

  // Demo tamper: a COPY of the chain with one record quietly edited.
  const displayChain = useMemo(() => {
    if (!tamperMode || chain.length < 2) return chain;
    const copy = chain.map((b) => ({ ...b }));
    copy[1] = { ...copy[1], quantity: Math.round(copy[1].quantity / 10), co2eKg: Math.round(copy[1].co2eKg / 10) };
    return copy;
  }, [chain, tamperMode]);

  const displayVerify = useMemo(() => verifyChain(displayChain), [displayChain]);
  const liveVerify = useMemo(() => verifyChain(chain), [chain]);
  const byCat = useMemo(() => totalsByCategory(chain), [chain]);
  const total = useMemo(() => totalCo2eKg(chain), [chain]);
  const maxCat = Math.max(1, ...Object.values(byCat));

  function submitRecord(e) {
    e.preventDefault();
    const qty = parseFloat(form.quantity);
    if (!form.organization.trim()) return setFormMsg('Please enter an organization / activity name.');
    if (!qty || qty <= 0) return setFormMsg('Please enter a quantity greater than zero.');
    if (!form.date) return setFormMsg('Please pick the activity date.');
    setChain((c) => appendRecord(c, {
      organization: form.organization.trim(),
      category: form.category,
      quantity: qty,
      date: form.date,
      evidence: form.evidence.trim(),
    }));
    setFormMsg('');
    setVerifyResult(null);
    setForm({ organization: '', category: 'electricity', quantity: '', date: '', evidence: '' });
    setTab('ledger');
  }

  function exportJSON() {
    download('carbonproof-ledger.json', JSON.stringify(chain, null, 2), 'application/json');
  }
  function exportCSV() {
    const head = 'index,timestamp,organization,category,quantity,unit,date,co2e_kg,evidence,prev_hash,hash';
    const rows = chain.map((b) => [b.index, b.timestamp, `"${b.organization.replaceAll('"', '""')}"`, b.category,
      b.quantity, b.unit, b.date, b.co2eKg, `"${(b.evidence || '').replaceAll('"', '""')}"`, b.prevHash, b.hash].join(','));
    download('carbonproof-ledger.csv', [head, ...rows].join('\n'), 'text/csv');
  }

  function resetDemo() {
    if (window.confirm('Reset the ledger to the 3 demo records? Your added records will be cleared (they only live in this browser).')) {
      setChain(seedChain());
      setVerifyResult(null);
      setTamperMode(false);
    }
  }

  const factor = EMISSION_FACTORS[form.category];

  return (
    <div className="app">
      <header className="hero">
        <div>
          <div className="brand">🌿 CarbonProof <span>AI</span></div>
          <p className="tagline">Emissions you can verify. Claims you can defend.</p>
          <p className="sub">
            A tamper-evident CO2e ledger for the <strong>Carbon Markets &amp; Emissions Transparency</strong> track —
            every record is hash-chained, every calculation shows its factor, and marketing claims are checked before they ship.
          </p>
        </div>
        <div className={`ledger-badge ${liveVerify.valid ? 'ok' : 'bad'}`}>
          <div className="badge-dot" />
          <div>
            <div className="badge-title">{liveVerify.valid ? 'Ledger verified' : 'Ledger INVALID'}</div>
            <div className="badge-sub">{chain.length} blocks · SHA-256 hash chain</div>
          </div>
        </div>
      </header>

      <nav className="tabs">
        {['dashboard', 'add', 'ledger', 'claims'].map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'dashboard' ? '📊 Dashboard' : t === 'add' ? '➕ Add record' : t === 'ledger' ? '🔗 Ledger' : '🤖 Claim checker'}
          </button>
        ))}
      </nav>

      {tab === 'dashboard' && (
        <section>
          <div className="cards">
            <div className="card"><div className="card-num">{fmtKg(total)}</div><div className="card-label">Total emissions recorded</div></div>
            <div className="card"><div className="card-num">{chain.length}</div><div className="card-label">Ledger records</div></div>
            <div className="card"><div className="card-num">{Object.keys(byCat).length}</div><div className="card-label">Categories in use</div></div>
            <div className="card"><div className="card-num">{liveVerify.valid ? '✓ Valid' : '✗ Broken'}</div><div className="card-label">Chain integrity (live check)</div></div>
          </div>

          <div className="panel">
            <h3>Emissions by category</h3>
            {CATEGORY_KEYS.filter((k) => byCat[k]).map((k) => (
              <div className="bar-row" key={k}>
                <div className="bar-label">{EMISSION_FACTORS[k].label} <span>({EMISSION_FACTORS[k].scope})</span></div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(byCat[k] / maxCat) * 100}%` }} /></div>
                <div className="bar-val">{fmtKg(byCat[k])}</div>
              </div>
            ))}
            {chain.length === 0 && <p className="muted">No records yet — add your first one.</p>}
          </div>

          <div className="panel">
            <h3>Recent records</h3>
            {[...chain].slice(-5).reverse().map((b) => (
              <div className="recent-row" key={b.hash}>
                <div>
                  <strong>{b.organization}</strong>
                  <div className="muted">{EMISSION_FACTORS[b.category].label} · {b.quantity.toLocaleString('en-IN')} {b.unit} · {b.date}</div>
                </div>
                <div className="recent-co2">{fmtKg(b.co2eKg)}</div>
              </div>
            ))}
            <div className="row-actions">
              <button className="btn" onClick={exportJSON}>Export JSON</button>
              <button className="btn" onClick={exportCSV}>Export CSV</button>
              <button className="btn ghost" onClick={resetDemo}>Reset demo data</button>
            </div>
          </div>
        </section>
      )}

      {tab === 'add' && (
        <section className="panel">
          <h3>Add an emissions record</h3>
          <p className="muted">
            CO2e is calculated transparently: <code>quantity × factor</code>. For {factor.label}, the factor is{' '}
            <strong>{factor.factorKgPerUnit} kg CO2e per {factor.unit}</strong> ({factor.scope}). Factors are documented
            prototype defaults — see the README note before using this for real reporting.
          </p>
          <form onSubmit={submitRecord} className="form">
            <label>Organization / activity name
              <input value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })}
                placeholder="e.g. Acme Logistics — Jaipur warehouse" />
            </label>
            <div className="form-2col">
              <label>Category
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORY_KEYS.map((k) => <option key={k} value={k}>{EMISSION_FACTORS[k].label} ({EMISSION_FACTORS[k].scope})</option>)}
                </select>
              </label>
              <label>Quantity ({factor.unit})
                <input type="number" min="0" step="any" value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="e.g. 1250" />
              </label>
            </div>
            <div className="form-2col">
              <label>Date of activity
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </label>
              <label>Calculated CO2e
                <input disabled value={form.quantity ? fmtKg(Math.round(parseFloat(form.quantity || 0) * factor.factorKgPerUnit * 100) / 100) : '—'} />
              </label>
            </div>
            <label>Evidence note / URL
              <input value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })}
                placeholder="e.g. Utility bill #…, fuel card statement, booking ref, https://…" />
            </label>
            {formMsg && <p className="form-error">{formMsg}</p>}
            <button className="btn primary" type="submit">Seal record into the ledger →</button>
          </form>
        </section>
      )}

      {tab === 'ledger' && (
        <section>
          <div className="panel">
            <h3>Tamper-evident ledger</h3>
            <p className="muted">
              Each block stores the SHA-256 hash of its own contents plus the previous block&apos;s hash. Edit any
              historical record and the hashes stop matching — the edit is detectable by anyone with the chain.
            </p>
            <div className="row-actions">
              <button className="btn primary" onClick={() => setVerifyResult(displayVerify)}>
                Verify ledger
              </button>
              {!tamperMode
                ? <button className="btn danger" onClick={() => { setTamperMode(true); setVerifyResult(null); }}>
                    ⚠ Simulate tampering (demo copy only)
                  </button>
                : <button className="btn" onClick={() => { setTamperMode(false); setVerifyResult(null); }}>
                    Restore real ledger
                  </button>}
            </div>
            {tamperMode && (
              <p className="tamper-note">
                Demo mode: a <strong>copy</strong> of the chain is shown with block #1 quietly reduced to one-tenth of
                its real quantity — as if someone edited history to look greener. Your real data is untouched.
                Press <strong>Verify ledger</strong> to catch it.
              </p>
            )}
            {verifyResult && (
              <div className={`verify-box ${verifyResult.valid ? 'ok' : 'bad'}`}>
                {verifyResult.valid
                  ? `✓ Chain valid — all ${displayChain.length} blocks recompute correctly and link in sequence.`
                  : <>✗ Chain INVALID — {verifyResult.problems.length} problem(s) found:
                      <ul>{verifyResult.problems.map((p, i) => <li key={i}>Block #{p.index}: {p.reason}</li>)}</ul></>}
              </div>
            )}
          </div>

          {[...displayChain].reverse().map((b) => (
            <div className={`block ${tamperMode && b.index === 1 ? 'tampered' : ''}`} key={b.hash}>
              <div className="block-head">
                <strong>Block #{b.index}</strong>
                <span className="muted">{new Date(b.timestamp).toLocaleString('en-IN')}</span>
                <span className="co2-pill">{fmtKg(b.co2eKg)}</span>
              </div>
              <div className="block-grid">
                <div><span>Organization</span>{b.organization}</div>
                <div><span>Activity</span>{EMISSION_FACTORS[b.category].label} · {b.quantity.toLocaleString('en-IN')} {b.unit} · {b.date}</div>
                <div><span>Calculation</span>{b.quantity.toLocaleString('en-IN')} {b.unit} × {EMISSION_FACTORS[b.category].factorKgPerUnit} kg CO2e/{b.unit} = {b.co2eKg.toLocaleString('en-IN')} kg CO2e</div>
                <div><span>Evidence</span>{b.evidence || '—'}</div>
                <div className="hash"><span>prevHash</span><code>{b.prevHash.slice(0, 32)}…</code></div>
                <div className="hash"><span>SHA-256</span><code>{b.hash.slice(0, 32)}…</code></div>
              </div>
            </div>
          ))}
        </section>
      )}

      {tab === 'claims' && (
        <section className="panel">
          <h3>AI claim checker</h3>
          <p className="muted">
            Paste a sustainability claim before it goes public. This prototype analysis assistant runs entirely in
            your browser — no external AI API — and scores the claim on the substantiation signals regulators and
            auditors ask for: quantities, scope, baseline, and checkable evidence. It flags vague absolute phrases
            like &quot;carbon neutral&quot; or &quot;100% green&quot; when they arrive without proof.
          </p>
          <textarea rows={4} value={claim} onChange={(e) => setClaim(e.target.value)}
            placeholder="e.g. We reduced Scope 2 emissions by 1,240 kg CO2e in FY2026 vs our FY2024 baseline, per our GHG Protocol inventory, independently verified…" />
          <div className="row-actions">
            <button className="btn primary" onClick={() => setClaimResult(analyzeClaim(claim))}>Analyze claim</button>
            <button className="btn ghost" onClick={() => {
              setClaim('We reduced Scope 2 emissions by 1,240 kg CO2e in FY2026 versus our FY2024 baseline, calculated under the GHG Protocol from metered electricity data and independently verified. Full inventory: https://example.org/carbon-ledger');
              setClaimResult(null);
            }}>Load a strong example</button>
          </div>
          {claimResult && (
            <div className="claim-result">
              <div className="score-row">
                <div className={`score ${claimResult.score >= 70 ? 'ok' : claimResult.score >= 40 ? 'mid' : 'bad'}`}>
                  {claimResult.score}/100
                </div>
                <div className="verdict">{claimResult.verdict}</div>
              </div>
              <ul className="findings">
                {claimResult.findings.map((f, i) => (
                  <li key={i} className={f.type}>{f.type === 'good' ? '✓' : f.type === 'warn' ? '!' : '✗'} {f.text}</li>
                ))}
              </ul>
              {claimResult.suggestions.length > 0 && (
                <>
                  <h4>How to make this claim defensible</h4>
                  <ul className="suggestions">
                    {claimResult.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </>
              )}
            </div>
          )}
        </section>
      )}

      <footer className="footer">
        CarbonProof AI — IEEE ClimateChain Global Hackathon prototype. Client-side demo: data lives in your
        browser&apos;s localStorage; hashes demonstrate tamper-evidence, not a production blockchain.
      </footer>
    </div>
  );
}
