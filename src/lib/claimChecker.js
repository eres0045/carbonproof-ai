// AI claim checker — honest prototype.
//
// This is a transparent, rule-based "AI-style" analysis assistant that runs
// entirely in the browser. It is NOT a large language model and makes no
// external calls. It scores a sustainability claim on substantiation
// signals that green-claims guidance consistently asks for: numbers with
// units, a defined scope, a baseline/timeframe, and checkable evidence.

const RISKY_PHRASES = [
  'carbon neutral',
  'net zero',
  'zero emissions',
  'carbon negative',
  'climate positive',
  'eco-friendly',
  'ecofriendly',
  '100% green',
  'fully green',
  'guilt-free',
  'guilt free',
  'planet-friendly',
  'planet friendly',
  'clean energy',
  'green energy',
  'sustainable',
  'environmentally friendly',
  'zero carbon',
  'carbon-free',
  'carbon free',
];

const VERIFICATION_TERMS = [
  'verified', 'audited', 'certified', 'third-party', 'third party',
  'iso 14064', 'iso 14001', 'ghg protocol', 'sbti', 'science based targets',
  'assured', 'independently', 'registry', 'offset registry', 'gold standard', 'verra',
];

const SCOPE_TERMS = ['scope 1', 'scope 2', 'scope 3', 'scope-1', 'scope-2', 'scope-3'];

export function analyzeClaim(rawClaim) {
  const claim = (rawClaim || '').trim();
  const lower = claim.toLowerCase();
  const findings = [];
  const suggestions = [];
  let score = 0;

  if (!claim) {
    return { score: 0, verdict: 'No claim entered', findings, suggestions };
  }

  // 1) Specificity: numbers with units / percentages (+30)
  const hasNumber = /\d/.test(claim);
  const hasUnit = /(kg|tonnes?|tons?|co2e|kwh|mwh|%|litres?|per cent)/i.test(claim);
  if (hasNumber && hasUnit) {
    score += 30;
    findings.push({ type: 'good', text: 'Contains specific quantities with units — the claim is measurable.' });
  } else if (hasNumber) {
    score += 15;
    findings.push({ type: 'warn', text: 'Contains numbers, but no clear unit or CO2e basis — add units (e.g. kg CO2e, kWh).' });
    suggestions.push('Attach a unit and basis to every number, e.g. "reduced emissions by 1,240 kg CO2e".');
  } else {
    findings.push({ type: 'bad', text: 'No numbers at all — the claim cannot be measured or checked.' });
    suggestions.push('Quantify the claim: state the amount (e.g. kg CO2e reduced) instead of a general promise.');
  }

  // 2) Scope (+20)
  if (SCOPE_TERMS.some((t) => lower.includes(t))) {
    score += 20;
    findings.push({ type: 'good', text: 'Names an emissions scope (Scope 1/2/3) — boundaries are defined.' });
  } else {
    findings.push({ type: 'warn', text: 'No emissions scope named — readers cannot tell what is included or excluded.' });
    suggestions.push('State the boundary: which Scope (1, 2 or 3) and which activities the claim covers.');
  }

  // 3) Evidence / verification (+25)
  if (VERIFICATION_TERMS.some((t) => lower.includes(t))) {
    score += 25;
    findings.push({ type: 'good', text: 'References verification, a standard, or a registry — the claim is checkable.' });
  } else if (/https?:\/\//i.test(claim)) {
    score += 15;
    findings.push({ type: 'warn', text: 'Includes a link, but no named standard or verifier — link the underlying data or report.' });
    suggestions.push('Name the standard or verifier behind the link (e.g. GHG Protocol inventory, audited report).');
  } else {
    findings.push({ type: 'bad', text: 'No evidence, standard, or verification mentioned — nothing a reader can check.' });
    suggestions.push('Add checkable evidence: an emissions inventory, a ledger/report link, or a named third-party verifier.');
  }

  // 4) Baseline / timeframe (+15)
  if (/(20\d{2}|baseline|compared to|since|by 20\d{2}|year|annual)/i.test(claim)) {
    score += 15;
    findings.push({ type: 'good', text: 'Includes a date, baseline, or timeframe — progress can be tracked over time.' });
  } else {
    findings.push({ type: 'warn', text: 'No baseline or timeframe — "reduced" compared to what, and by when?' });
    suggestions.push('Add a baseline and period, e.g. "vs. our FY2024 baseline, measured Jan–Dec 2026".');
  }

  // 5) Methodology / offsets honesty (+10)
  if (/(offset|methodology|calculated|measured|inventory|ledger)/i.test(lower)) {
    score += 10;
    findings.push({ type: 'good', text: 'Mentions how the result was achieved or calculated (methodology/offsets/ledger).' });
  } else {
    suggestions.push('Explain how: measured reductions vs. purchased offsets, and the method used to calculate them.');
  }

  // 6) Risky vague phrases (-12 each, capped at -36)
  const riskyFound = RISKY_PHRASES.filter((p) => lower.includes(p));
  if (riskyFound.length) {
    const penalty = Math.min(36, riskyFound.length * 12);
    score -= penalty;
    findings.push({
      type: 'bad',
      text: `Vague or absolute phrase(s) detected: ${riskyFound.map((p) => `"${p}"`).join(', ')}. ` +
        'Absolute claims like these are the most commonly challenged form of greenwashing when unsubstantiated.',
    });
    suggestions.push('Replace absolute phrases with the specific, scoped result — or keep the phrase ONLY alongside the evidence above.');
  }

  score = Math.max(0, Math.min(100, score));

  let verdict;
  if (score >= 70) verdict = 'Reasonably substantiated — still publish the underlying data';
  else if (score >= 40) verdict = 'Needs substantiation — fixable with the points below';
  else verdict = 'High greenwashing risk — do not publish as written';

  return { score, verdict, findings, suggestions };
}
