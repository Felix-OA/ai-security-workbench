import { severityWeights, likelihoodWeights, impactWeights, statusMultipliers } from "./constants.js";

export function findingScore(result) {
  const score =
    (severityWeights[result.severity] || 0) *
    (likelihoodWeights[result.likelihood] || 1) *
    (impactWeights[result.impact] || 1) *
    (statusMultipliers[result.resultStatus] || 0);
  return Math.round(score * 10) / 10;
}

export function projectRiskScore(results) {
  const tested = results.filter((result) => ["Passed", "Failed", "Partial"].includes(result.resultStatus));
  if (!tested.length) return 0;
  const total = tested.reduce((sum, result) => sum + Number(result.riskScore ?? findingScore(result)), 0);
  return Math.round((total / (tested.length * 22.5)) * 100);
}

export function riskLevel(score) {
  if (score >= 75) return "Critical";
  if (score >= 50) return "High";
  if (score >= 25) return "Medium";
  return "Low";
}

