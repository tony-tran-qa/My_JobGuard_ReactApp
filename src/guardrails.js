// Safety rule for AI vet results.
// The AI has no live data. It may only reach HIGH / AVOID when it cites one of the
// six concrete scam signals listed in the prompt (numbers 1 to 6).
// Keep this in step with lib/jobguard-data.js in the Chrome extension repo.

export const GUARDRAIL_NOTE =
  "Capped at CAUTION: the AI cited no concrete scam signal and has no live data, so this is an unverified opinion.";

/** Keep only whole numbers 1 to 6, no duplicates. */
export function normalizeSignals(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const v of list) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 1 && n <= 6 && !out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * Enforce the scoring rule in code instead of trusting the model.
 * - one or more valid signals -> HIGH / AVOID
 * - HIGH or AVOID with no valid signal -> capped at MEDIUM / CAUTION, with a note
 */
export function applyGuardrails(result) {
  const r = result || {};
  r.triggeredSignals = normalizeSignals(r.triggeredSignals);
  if (r.triggeredSignals.length > 0) {
    r.riskLevel = "HIGH";
    r.recommendation = "AVOID";
    return r;
  }
  if (r.riskLevel === "HIGH" || r.recommendation === "AVOID") {
    r.riskLevel = "MEDIUM";
    r.recommendation = "CAUTION";
    r.downgraded = true;
    r.confidenceNote = r.confidenceNote ? r.confidenceNote + " " + GUARDRAIL_NOTE : GUARDRAIL_NOTE;
  }
  return r;
}
