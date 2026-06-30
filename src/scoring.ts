export const severityWeights = {
  Info: 0,
  Low: 2,
  Medium: 4,
  High: 7,
  Critical: 10
} as const;

export const likelihoodWeights = {
  Low: 1,
  Medium: 1.25,
  High: 1.5
} as const;

export const impactWeights = {
  Low: 1,
  Medium: 1.25,
  High: 1.5
} as const;

export const resultStatusMultipliers = {
  "Not Tested": 0,
  Passed: 0,
  Failed: 1,
  Partial: 0.5,
  "Not Applicable": 0
} as const;

export type Severity = keyof typeof severityWeights;
export type Likelihood = keyof typeof likelihoodWeights;
export type Impact = keyof typeof impactWeights;
export type ResultStatus = keyof typeof resultStatusMultipliers;
export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

export type ScoredResult = {
  severity: string;
  likelihood: string;
  impact: string;
  resultStatus: string;
  riskScore?: number;
};

const maxFindingScore = severityWeights.Critical * likelihoodWeights.High * impactWeights.High;
const includedStatuses = new Set(["Passed", "Failed", "Partial"]);

function oneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

export function calculateFindingRiskScore(
  severity: string,
  likelihood: string,
  impact: string,
  resultStatus: string
) {
  const severityWeight = severityWeights[severity as Severity] ?? 0;
  const likelihoodWeight = likelihoodWeights[likelihood as Likelihood] ?? 1;
  const impactWeight = impactWeights[impact as Impact] ?? 1;
  const statusMultiplier = resultStatusMultipliers[resultStatus as ResultStatus] ?? 0;
  return oneDecimal(severityWeight * likelihoodWeight * impactWeight * statusMultiplier);
}

export function calculateProjectRiskScore(results: ScoredResult[]) {
  const tested = results.filter((result) => includedStatuses.has(result.resultStatus));
  if (tested.length === 0) return 0;
  const total = tested.reduce((sum, result) => {
    const score =
      typeof result.riskScore === "number"
        ? result.riskScore
        : calculateFindingRiskScore(result.severity, result.likelihood, result.impact, result.resultStatus);
    return sum + score;
  }, 0);
  return Math.round((total / (tested.length * maxFindingScore)) * 100);
}

export function getRiskLevel(score: number): RiskLevel {
  if (score >= 75) return "Critical";
  if (score >= 50) return "High";
  if (score >= 25) return "Medium";
  return "Low";
}

export function isCompletedResult(status: string) {
  return includedStatuses.has(status);
}
