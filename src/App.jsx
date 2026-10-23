import { useEffect, useMemo, useState } from 'react';
import { EMISSION_FACTORS, CATEGORY_KEYS, FACTOR_SOURCES } from './data/emissionFactors.js';
import {
  appendRecord, appendCreditIssue, appendCreditRetire, verifyChain, seedChain,
  totalsByCategory, totalCo2eKg, summarizeCredits, netPositionKg,
} from './lib/ledger.js';
import { analyzeClaim } from './lib/claimChecker.js';
import { parseActivitiesCsv, CSV_TEMPLATE } from './lib/csvImport.js';
import anchor from './data/anchor.json';

const STORAGE_KEY = 'carbonproof-ai-chain-v2';

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
  if (Math.abs(kg) >= 1000) return `${(kg / 1000).toFixed(2)} t CO2e`;
  return `${kg.toLocaleString('en-IN')} kg CO2e`;
}
function fmtT(t) { return `${t.toLocaleString('en-IN')} t`; }

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
  const [form, setForm] = useState({ organization: '', category: 'electricity', quantity: '', date: '', evidence: '' });
  const [formMsg, setFormMsg] = useState('');
  const [csvMsg, setCsvMsg] = useState('');
  const [issueForm, setIssueForm] = useState({ project: '', serial: '', vintage: '2025', tonnes: '', evidence: '' });
  const [retireForm, setRetireForm] = useState({ serial: '', tonnes: '', beneficiary: '' });
  const [creditMsg, setCreditMsg] = useState('');

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
  const credits = useMemo(() => summarizeCredits(chain), [chain]);
  const netKg = useMemo(() => netPositionKg(chain), [chain]);
  const maxCat = Math.max(1, ...Object.values(byCat));
  const headHash = chain.length ? chain[chain.length - 1].hash : '';
  const anchorMatches = anchor.headHash && anchor.headHash === headHash;
  const emissionBlocks = chain.filter((b) => (b.type || 'emission') === 'emission');

  function submitRecord(e) {
    e.preventDefault();
    const qty = parseFloat(form.quantity);
    if (!form.organization.trim()) return setFormMsg('Please enter an organization / activity name.');
    if (!qty || qty <= 0) return setFormMsg('Please enter a quantity greater than zero.');
    if (!form.date) return setFormMsg('Please pick the activity date.');
    setChain((c) => appendRecord(c, {
      organization: form.organization.trim(), category: form.category, quantity: qty,
      date: form.date, evidence: form.evidence.trim(),
    }));
    setFormMsg(''); setVerifyResult(null);
    setForm({ organization: '', category: 'electricity', quantity: '', date: '', evidence: '' });
    setTab('ledger');
  }

  function importCsv(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      const { records, errors } = parseActivitiesCsv(text);
      if (!records.length) { setCsvMsg(`No records imported. ${errors.join(' ')}`); return; }
      setChain((c) => records.reduce((acc, r) => appendRecord(acc, r), c));
      setCsvMsg(`Imported ${records.length} record(s) and sealed them into the ledger.${errors.length ? ` Skipped rows: ${errors.join(' ')}` : ''}`);
      setVerifyResult(null);
    });
    e.target.value = '';
  }

  function submitIssue(e) {
    e.preventDefault();
    const tonnes = parseFloat(issueForm.tonnes);
    if (!issueForm.project.trim()) return setCreditMsg('Enter the credit project name.');
    if (!issueForm.serial.trim()) return setCreditMsg('Enter the registry serial for these credits.');
    if (credits.rows.some((r) => r.serial === issueForm.serial.trim()))
      return setCreditMsg(`Serial ${issueForm.serial.trim()} is already issued in this registry — a serial can only be issued once. That is the double-counting guard working.`);
    if (!tonnes || tonnes <= 0) return setCreditMsg('Tonnes must be a positive number.');
    setChain((c) => appendCreditIssue(c, {
      organization: 'GreenMart Retail — offset portfolio',
      project: issueForm.project.trim(), serial: issueForm.serial.trim(),
      vintage: Number(issueForm.vintage) || undefined, tonnes,
      date: new Date().toISOString().slice(0, 10), evidence: issueForm.evidence.trim(),
    }));
    setCreditMsg(''); setVerifyResult(null);
    setIssueForm({ project: '', serial: '', vintage: '2025', tonnes: '', evidence: '' });
  }

  function submitRetire(e) {
    e.preventDefault();
    const tonnes = parseFloat(retireForm.tonnes);
    const row = credits.rows.find((r) => r.serial === retireForm.serial);
    if (!row) return setCreditMsg('Pick an issued credit serial to retire from.');
    if (!tonnes || tonnes <= 0) return setCreditMsg('Tonnes must be a positive number.');
    if (tonnes > row.held)
      return setCreditMsg(`Cannot retire ${tonnes} t from ${row.serial}: only ${row.held} t remain held (${row.issued} t issued, ${row.retired} t already retired). Retiring more than held is exactly how double counting happens — the registry refuses it.`);
    setChain((c) => appendCreditRetire(c, {
      organization: 'GreenMart Retail — offset portfolio',
      serial: retireForm.serial, tonnes,
      beneficiary: retireForm.beneficiary.trim() || 'GreenMart Retail operations',
      date: new Date().toISOString().slice(0, 10), evidence: 'Retirement recorded in-app',
    }));
    setCreditMsg(''); setVerifyResult(null);
    setRetireForm({ serial: '', tonnes: '', beneficiary: '' });
  }

  function exportJSON() { download('carbonproof-ledger.json', JSON.stringify(chain, null, 2), 'application/json'); }
  function exportCSV() {
    const head = 'index,type,timestamp,organization,category,quantity,unit,date,co2e_kg,project,serial,vintage,tonnes,beneficiary,evidence,prev_hash,hash';
    const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const rows = chain.map((b) => [b.index, b.type || 'emission', b.timestamp, esc(b.organization), b.category || '',
      b.quantity ?? '', b.unit || '', b.date, b.co2eKg ?? '', esc(b.project), b.serial || '', b.vintage ?? '',
      b.tonnes ?? '', esc(b.beneficiary), esc(b.evidence), b.prevHash, b.hash].join(','));
    download('carbonproof-ledger.csv', [head, ...rows].join('\n'), 'text/csv');
  }

  function resetDemo() {
    if (window.confirm('Reset to the seeded FY2025-26 dataset? Records you added will be cleared (they only live in this browser).')) {
      setChain(seedChain()); setVerifyResult(null); setTamperMode(false);
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
            A tamper-evident CO2e ledger + carbon-credit registry for the <strong>Carbon Markets &amp; Emissions
            Transparency</strong> track — every record is hash-chained, every calculation shows its published factor,
            credits can never be counted twice, and the seeded chain head is publicly anchored via OpenTimestamps.
          </p>
        </div>
        <div className={`ledger-badge ${liveVerify.valid ? 'ok' : 'bad'}`}>
          <div className="badge-dot" />
          <div>
            <div className="badge-title">{liveVerify.valid ? 'Ledger verified' : 'Ledger INVALID'}</div>
            <div className="badge-sub">{chain.length} blocks · SHA-256 hash chain · {anchor.headHash ? (anchorMatches ? 'head anchored ⛓' : 'seeded state anchored ⛓') : 'anchor pending'}</div>
          </div>
        </div>
      </header>

      <nav className="tabs">
        {['dashboard', 'add', 'ledger', 'credits', 'claims'].map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'dashboard' ? '📊 Dashboard' : t === 'add' ? '➕ Add record' : t === 'ledger' ? '🔗 Ledger'
              : t === 'credits' ? '🪙 Credits' : '🔍 Claim checker'}
          </button>
        ))}
      </nav>

      {tab === 'dashboard' && (
        <section>
          <div className="cards">
            <div className="card"><div className="card-num">{fmtKg(total)}</div><div className="card-label">Total emissions recorded (FY2025-26)</div></div>
            <div className="card"><div className="card-num">{fmtT(credits.retiredT)}</div><div className="card-label">Credits retired against emissions</div></div>
            <div className="card">
              <div className="card-num">{netKg <= 0 ? '✓ Neutral' : fmtKg(netKg)}</div>
              <div className="card-label">{netKg <= 0 ? 'Net position — retirements cover emissions' : `Net position — retire ${fmtKg(netKg)} more to reach neutral`}</div>
            </div>
            <div className="card"><div className="card-num">{chain.length}</div><div className="card-label">Ledger blocks ({emissionBlocks.length} emissions · {chain.length - emissionBlocks.length} credit events)</div></div>
          </div>

          <div className="panel">
            <h3>⛓ Anchored to a public blockchain</h3>
            {anchor.headHash ? (
              <>
                <p className="muted">
                  The seeded ledger&apos;s state is sealed in a public anchor record, timestamped via
                  <strong> OpenTimestamps</strong> — an open protocol that batches digests into the Bitcoin
                  blockchain{anchor.bitcoinBlock
                    ? <> (confirmed in Bitcoin block <strong>{anchor.bitcoinBlock}</strong>)</>
                    : ' (Bitcoin block confirmation pending — the proof already carries a calendar attestation and upgrades automatically)'} —
                  a public record nobody can quietly rewrite, including us.
                  {anchorMatches
                    ? ' This browser\'s chain head matches the anchored hash exactly.'
                    : ' This browser\'s chain has advanced past the anchored state (you added records) — the anchor still proves the seeded state at the time shown.'}
                </p>
                <div className="block-grid">
                  <div><span>Anchored head hash</span><code>{anchor.headHash.slice(0, 40)}…</code></div>
                  <div><span>Current head hash</span><code>{headHash.slice(0, 40)}…</code></div>
                </div>
                <div className="row-actions">
                  <a className="btn" href="/carbonproof-anchor.txt" download>Download the anchor record (.txt)</a>
                  <a className="btn" href="/anchor.ots" download>Download the OpenTimestamps proof (.ots)</a>
                  <a className="btn ghost" href="https://opentimestamps.org" target="_blank" rel="noreferrer">Verify it yourself at opentimestamps.org ↗</a>
                </div>
                <p className="muted">Upload the anchor record and its .ots proof to the verifier on opentimestamps.org — it recomputes the record&apos;s SHA-256 and checks its timestamp against the Bitcoin blockchain, with no involvement from this app.</p>
              </>
            ) : (
              <p className="muted">Anchor proof is being prepared for the seeded ledger head.</p>
            )}
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
          </div>

          <div className="panel">
            <h3>Recent records</h3>
            {[...chain].slice(-5).reverse().map((b) => (
              <div className="recent-row" key={b.hash}>
                <div>
                  <strong>{(b.type || 'emission') === 'emission' ? b.organization : b.type === 'credit_issue' ? `Credits issued — ${b.project}` : `Credits retired — ${b.serial}`}</strong>
                  <div className="muted">
                    {(b.type || 'emission') === 'emission'
                      ? `${EMISSION_FACTORS[b.category].label} · ${b.quantity.toLocaleString('en-IN')} ${b.unit} · ${b.date}`
                      : `${b.tonnes} t · ${b.date}`}
                  </div>
                </div>
                <div className="recent-co2">{(b.type || 'emission') === 'emission' ? fmtKg(b.co2eKg) : `${b.tonnes} t`}</div>
              </div>
            ))}
            <div className="row-actions">
              <button className="btn" onClick={exportJSON}>Export JSON</button>
              <button className="btn" onClick={exportCSV}>Export CSV</button>
              <button className="btn ghost" onClick={resetDemo}>Reset demo data</button>
            </div>
          </div>

          <div className="panel">
            <h3>Emission factors — published sources</h3>
            <p className="muted">Every CO2e figure in this app is computed from a named, published factor — no invented numbers:</p>
            <ul className="suggestions">
              {FACTOR_SOURCES.map((s) => <li key={s.name}><strong>{s.name}</strong> — {s.detail}</li>)}
            </ul>
          </div>
        </section>
      )}

      {tab === 'add' && (
        <section>
          <div className="panel">
            <h3>Add an emissions record</h3>
            <p className="muted">
              CO2e is calculated transparently: <code>quantity × factor</code>. For {factor.label}, the factor is{' '}
              <strong>{factor.factorKgPerUnit} kg CO2e per {factor.unit}</strong> ({factor.scope}) — {factor.source}.
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
          </div>

          <div className="panel">
            <h3>Import activity data (CSV)</h3>
            <p className="muted">
              Bulk-import a spreadsheet export. Columns: <code>organization, category, quantity, date, evidence</code> —
              category is one of {CATEGORY_KEYS.join(', ')}. Every imported row is sealed into the ledger like a
              hand-entered record, and invalid rows are reported rather than silently dropped.
            </p>
            <div className="row-actions">
              <label className="btn primary" style={{ cursor: 'pointer' }}>
                Choose CSV file…
                <input type="file" accept=".csv,text/csv" onChange={importCsv} style={{ display: 'none' }} />
              </label>
              <button className="btn" onClick={() => download('carbonproof-import-template.csv', CSV_TEMPLATE, 'text/csv')}>
                Download template
              </button>
            </div>
            {csvMsg && <p className="muted" style={{ marginTop: 12 }}>{csvMsg}</p>}
          </div>
        </section>
      )}

      {tab === 'ledger' && (
        <section>
          <div className="panel">
            <h3>Tamper-evident ledger</h3>
            <p className="muted">
              Each block stores the SHA-256 hash of its own contents plus the previous block&apos;s hash. Emissions,
              credit issuances and credit retirements share one chain — so verification checks the CO2e math, the
              hash links, <em>and</em> the carbon-market invariants (no duplicate serials, no retiring more than was
              issued, no phantom credits) in a single pass.
            </p>
            <div className="row-actions">
              <button className="btn primary" onClick={() => setVerifyResult(displayVerify)}>Verify ledger</button>
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
                  ? `✓ Chain valid — all ${displayChain.length} blocks recompute correctly, link in sequence, and respect the credit invariants.`
                  : <>✗ Chain INVALID — {verifyResult.problems.length} problem(s) found:
                      <ul>{verifyResult.problems.map((p, i) => <li key={i}>Block #{p.index}: {p.reason}</li>)}</ul></>}
              </div>
            )}
          </div>

          {[...displayChain].reverse().map((b) => {
            const type = b.type || 'emission';
            return (
              <div className={`block ${type !== 'emission' ? 'credit' : ''} ${tamperMode && b.index === 1 ? 'tampered' : ''}`} key={b.hash}>
                <div className="block-head">
                  <strong>Block #{b.index}</strong>
                  <span className={`type-pill ${type}`}>{type === 'emission' ? 'EMISSION' : type === 'credit_issue' ? 'CREDIT ISSUED' : 'CREDIT RETIRED'}</span>
                  <span className="muted">{new Date(b.timestamp).toLocaleString('en-IN')}</span>
                  <span className="co2-pill">{type === 'emission' ? fmtKg(b.co2eKg) : `${b.tonnes} t`}</span>
                </div>
                {type === 'emission' ? (
                  <div className="block-grid">
                    <div><span>Organization</span>{b.organization}</div>
                    <div><span>Activity</span>{EMISSION_FACTORS[b.category].label} · {b.quantity.toLocaleString('en-IN')} {b.unit} · {b.date}</div>
                    <div><span>Calculation</span>{b.quantity.toLocaleString('en-IN')} {b.unit} × {EMISSION_FACTORS[b.category].factorKgPerUnit} kg CO2e/{b.unit} = {b.co2eKg.toLocaleString('en-IN')} kg CO2e</div>
                    <div><span>Evidence</span>{b.evidence || '—'}</div>
                    <div className="hash"><span>prevHash</span><code>{b.prevHash.slice(0, 32)}…</code></div>
                    <div className="hash"><span>SHA-256</span><code>{b.hash.slice(0, 32)}…</code></div>
                  </div>
                ) : (
                  <div className="block-grid">
                    {type === 'credit_issue' && <div><span>Project</span>{b.project}</div>}
                    {type === 'credit_retire' && <div><span>Beneficiary</span>{b.beneficiary}</div>}
                    <div><span>Serial</span>{b.serial}</div>
                    {type === 'credit_issue' && <div><span>Vintage</span>{b.vintage}</div>}
                    <div><span>Amount</span>{b.tonnes} t CO2e · {b.date}</div>
                    <div><span>Evidence</span>{b.evidence || '—'}</div>
                    <div className="hash"><span>prevHash</span><code>{b.prevHash.slice(0, 32)}…</code></div>
                    <div className="hash"><span>SHA-256</span><code>{b.hash.slice(0, 32)}…</code></div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {tab === 'credits' && (
        <section>
          <div className="cards">
            <div className="card"><div className="card-num">{fmtT(credits.issuedT)}</div><div className="card-label">Credits issued into the registry</div></div>
            <div className="card"><div className="card-num">{fmtT(credits.retiredT)}</div><div className="card-label">Credits retired</div></div>
            <div className="card"><div className="card-num">{fmtT(credits.heldT)}</div><div className="card-label">Credits still held</div></div>
            <div className="card"><div className="card-num">{netKg <= 0 ? '✓ Neutral' : fmtKg(netKg)}</div><div className="card-label">Net position (emissions − retired)</div></div>
          </div>

          <div className="panel">
            <h3>Credit registry — the double-counting guard</h3>
            <p className="muted">
              Double counting is the carbon market&apos;s core credibility problem: the same credit sold, claimed or
              retired twice. Here every issuance and retirement is a sealed block in the same hash chain as the
              emissions themselves, and verification enforces three invariants: a serial can be issued only once;
              a retirement must reference an issued serial; and cumulative retirements can never exceed issuance.
              Break any of them — in the forms below or by editing history — and the chain fails verification loudly.
            </p>
            <table className="credits-table">
              <thead><tr><th>Serial</th><th>Project</th><th>Vintage</th><th>Issued</th><th>Retired</th><th>Held</th></tr></thead>
              <tbody>
                {credits.rows.map((r) => (
                  <tr key={r.serial}>
                    <td><code>{r.serial}</code></td><td>{r.project}</td><td>{r.vintage}</td>
                    <td>{r.issued} t</td><td>{r.retired} t</td><td><strong>{r.held} t</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <h3>⛓ The same registry, enforced on-chain</h3>
            <p className="muted">
              This registry is mirrored by <strong>CarbonRegistry</strong>, a verified Solidity smart contract live on the
              Ethereum Sepolia testnet. It enforces the identical rules at network level — a serial can be issued only
              once, and retirements can never exceed issuance — and it anchors this ledger&apos;s seeded head hash
              on-chain for FY2025-26. The contract is seeded with the same state shown above: 750 t issued, 300 t
              retired, 450 t held. Read the verified source and every transaction on the explorer:
            </p>
            <div className="block-grid">
              <div><span>Contract (Sepolia)</span><code>0xEeDa0d76…edCF0a8e</code></div>
              <div><span>On-chain state</span><code>750 t issued · 300 t retired · 450 t held</code></div>
            </div>
            <div className="row-actions">
              <a className="btn" href="https://sepolia.etherscan.io/address/0xEeDa0d764654798Fb25e3981Be236A75edCF0a8e" target="_blank" rel="noreferrer">View the verified contract ↗</a>
              <a className="btn ghost" href="https://sepolia.etherscan.io/tx/0x03ff6481af01ad3507401f8f2987641b77afb279c1a561d7b474cff9fb4e9c81" target="_blank" rel="noreferrer">See the on-chain anchor tx ↗</a>
            </div>
            <p className="muted">Full contract address: <code>0xEeDa0d764654798Fb25e3981Be236A75edCF0a8e</code>. Source and test suite live in the repo under <code>contracts/</code>.</p>
          </div>

          <div className="panel">
            <h3>Retire credits</h3>
            <p className="muted">Retiring is permanent and sealed into the chain — try retiring more than a serial holds and the registry refuses.</p>
            <form onSubmit={submitRetire} className="form">
              <div className="form-2col">
                <label>Credit serial
                  <select value={retireForm.serial} onChange={(e) => setRetireForm({ ...retireForm, serial: e.target.value })}>
                    <option value="">Select a serial…</option>
                    {credits.rows.map((r) => <option key={r.serial} value={r.serial}>{r.serial} — {r.held} t held</option>)}
                  </select>
                </label>
                <label>Tonnes to retire
                  <input type="number" min="0" step="any" value={retireForm.tonnes}
                    onChange={(e) => setRetireForm({ ...retireForm, tonnes: e.target.value })} placeholder="e.g. 50" />
                </label>
              </div>
              <label>Beneficiary (who the retirement counts for)
                <input value={retireForm.beneficiary} onChange={(e) => setRetireForm({ ...retireForm, beneficiary: e.target.value })}
                  placeholder="e.g. GreenMart Retail operations, FY2025-26" />
              </label>
              {creditMsg && <p className="form-error">{creditMsg}</p>}
              <button className="btn primary" type="submit">Retire credits →</button>
            </form>
          </div>

          <div className="panel">
            <h3>Issue credits</h3>
            <p className="muted">Record newly acquired credits under their registry serial. A serial already in the registry cannot be issued again.</p>
            <form onSubmit={submitIssue} className="form">
              <label>Project name
                <input value={issueForm.project} onChange={(e) => setIssueForm({ ...issueForm, project: e.target.value })}
                  placeholder="e.g. Bundled Solar Power Project, Rajasthan" />
              </label>
              <div className="form-2col">
                <label>Registry serial
                  <input value={issueForm.serial} onChange={(e) => setIssueForm({ ...issueForm, serial: e.target.value })}
                    placeholder="e.g. IN-SOLAR-2026-00001" />
                </label>
                <label>Vintage year
                  <input type="number" value={issueForm.vintage} onChange={(e) => setIssueForm({ ...issueForm, vintage: e.target.value })} />
                </label>
              </div>
              <div className="form-2col">
                <label>Tonnes (1 credit = 1 t CO2e)
                  <input type="number" min="0" step="any" value={issueForm.tonnes}
                    onChange={(e) => setIssueForm({ ...issueForm, tonnes: e.target.value })} placeholder="e.g. 100" />
                </label>
                <label>Evidence note / URL
                  <input value={issueForm.evidence} onChange={(e) => setIssueForm({ ...issueForm, evidence: e.target.value })}
                    placeholder="e.g. Purchase agreement on file" />
                </label>
              </div>
              <button className="btn primary" type="submit">Issue credits →</button>
            </form>
          </div>
        </section>
      )}

      {tab === 'claims' && (
        <section className="panel">
          <h3>Claim checker — explainable, rule-based</h3>
          <p className="muted">
            Paste a sustainability claim before it goes public. This checker is deliberately <strong>not</strong> a
            black-box AI: it is a transparent rule engine that runs entirely in your browser and scores the claim on
            the substantiation signals regulators and auditors ask for — quantities, scope, baseline, checkable
            evidence — and flags vague absolute phrases. And when a claim says &quot;carbon neutral&quot;, it goes
            further: it cross-checks the words against this ledger&apos;s own numbers (emissions recorded vs credits
            actually retired).
          </p>
          <textarea rows={4} value={claim} onChange={(e) => setClaim(e.target.value)}
            placeholder="e.g. We reduced Scope 2 emissions by 1,240 kg CO2e in FY2026 vs our FY2024 baseline, per our GHG Protocol inventory, independently verified…" />
          <div className="row-actions">
            <button className="btn primary" onClick={() => setClaimResult(analyzeClaim(claim, { emittedKg: total, retiredT: credits.retiredT }))}>Analyze claim</button>
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
        CarbonProof AI — IEEE ClimateChain Global Hackathon prototype. Client-side demo: records live in your
        browser&apos;s localStorage and demonstrate tamper-evidence; the seeded state is sealed in a public anchor
        record timestamped via OpenTimestamps (Bitcoin-anchored) so it cannot be quietly rewritten afterwards.
        The credit registry is also mirrored by a verified smart contract on the Ethereum Sepolia testnet
        (see the Credits tab); a production deployment would anchor every state change on-chain.
      </footer>
    </div>
  );
}
