import { calculateProjectRiskScore, getRiskLevel, isCompletedResult } from "./scoring.js";
import type { Project, TestCase, TestResult } from "./store.js";

function clean(value: string | undefined, fallback = "Not documented") {
  return value && value.trim() ? value.trim() : fallback;
}

function tableCell(value: string | number | undefined) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("\r\n", "<br>")
    .replaceAll("\n", "<br>")
    .trim();
}

function maxBacktickRun(value: string) {
  return Math.max(0, ...Array.from(value.matchAll(/`+/g)).map((match) => match[0].length));
}

function fencedTextBlock(value: string) {
  const text = clean(value);
  const fence = "`".repeat(Math.max(3, maxBacktickRun(text) + 1));
  return `${fence}text\n${text}\n${fence}`;
}

function safeRagContext(value: string | undefined, fallback: string) {
  const text = clean(value, fallback);
  return text.includes("Chunk 1:") && text.includes("```text") ? text : fencedTextBlock(text);
}

function countStatus(results: TestResult[], status: string) {
  return results.filter((result) => result.resultStatus === status).length;
}

function highestSeverity(results: TestResult[]) {
  const order = ["Info", "Low", "Medium", "High", "Critical"];
  return results.reduce((highest, result) => {
    return order.indexOf(result.severity) > order.indexOf(highest) ? result.severity : highest;
  }, "Info");
}

function testName(result: TestResult, tests: TestCase[]) {
  return result.customTestName || tests.find((test) => test.id === result.testCaseId)?.name || "Custom test";
}

function recommendationGroups(results: TestResult[]) {
  const actionable = results.filter((result) => ["Failed", "Partial"].includes(result.resultStatus));
  return {
    critical: actionable.filter((result) => result.severity === "Critical"),
    high: actionable.filter((result) => result.severity === "High"),
    mediumLow: actionable.filter((result) => !["Critical", "High"].includes(result.severity))
  };
}

function recommendationLines(results: TestResult[], tests: TestCase[]) {
  if (results.length === 0) return "- No items in this priority group.";
  return results
    .map((result) => `- **${testName(result, tests)}**: ${clean(result.recommendation, "Review and document remediation steps.")}`)
    .join("\n");
}

function sourceContext(result: TestResult) {
  if (result.source === "Prompt Injection Playground") {
    return `Source: Prompt Injection Playground
Scenario Type: ${clean(result.scenarioType)}

System Prompt / Intended Behavior:
${clean(result.systemPrompt)}

Retrieved Context Summary:
${clean(result.retrievedContext, "No retrieved context documented.")}
`;
  }
  if (result.source === "RAG Attack Lab") {
    return `Source: RAG Attack Lab
RAG Risk Type: ${clean(result.ragRiskType)}

System Prompt / Intended Behavior:
${clean(result.systemPrompt)}

User Question:
${clean(result.userQuestion)}

Retrieved Context Summary:
${safeRagContext(result.retrievedContextSummary || result.retrievedContext, "No retrieved context documented.")}

Untrusted / Risky Chunks Detected:
${safeRagContext(result.untrustedChunksSummary, "No untrusted or risky retrieved chunks documented.")}
`;
  }
  return `Source: ${clean(result.source, "Test Library")}`;
}

export function generateRiskSnapshotReport(project: Project, results: TestResult[], tests: TestCase[]) {
  const completed = results.filter((result) => isCompletedResult(result.resultStatus));
  const failed = countStatus(results, "Failed");
  const partial = countStatus(results, "Partial");
  const passed = countStatus(results, "Passed");
  const notTested = countStatus(results, "Not Tested");
  const projectRiskScore = calculateProjectRiskScore(results);
  const riskLevel = getRiskLevel(projectRiskScore);
  const severity = highestSeverity(results.filter((result) => ["Failed", "Partial"].includes(result.resultStatus)));
  const groups = recommendationGroups(results);

  const executiveSummary = `This AI Risk Snapshot assessed ${project.clientName} against ${completed.length} documented LLM security tests. The assessment identified ${failed} failed tests and ${partial} partial failures. The highest observed severity was ${severity}, and the overall documented risk level is ${riskLevel}.`;

  const findingRows = results
    .map((result, index) => {
      const name = testName(result, tests);
      return `| ${tableCell(`F-${String(index + 1).padStart(3, "0")}`)} | ${tableCell(name)} | ${tableCell(result.source || "Test Library")} | ${tableCell(result.category)} | ${tableCell(result.severity)} | ${tableCell(result.resultStatus)} | ${tableCell(result.riskScore.toFixed(1))} | ${tableCell(clean(result.recommendation, "Document remediation."))} |`;
    })
    .join("\n");

  const detailedFindings = results
    .filter((result) => ["Failed", "Partial"].includes(result.resultStatus))
    .map((result, index) => {
      const name = testName(result, tests);
      const test = tests.find((item) => item.id === result.testCaseId);
      return `### Finding ${index + 1}: ${name}

${sourceContext(result)}

Category: ${result.category}
OWASP-style Mapping: ${result.owaspMapping}
Severity: ${result.severity}
Likelihood: ${result.likelihood}
Impact: ${result.impact}
Status: ${result.resultStatus}
Risk Score: ${result.riskScore.toFixed(1)}

Prompt/Input Used:

> ${clean(result.actualPrompt)}

Observed Response Summary:
${clean(result.modelResponse)}

Evidence:
${clean(result.evidenceNotes)}

Recommendation:
${clean(result.recommendation)}

Evaluation Criteria:
${clean(result.evaluationCriteria || test?.evaluationCriteria, "Compare observed behavior against the expected behavior and failure indicators.")}

Evidence Guidance:
${clean(test?.evidenceGuidance, "Record prompt/input, observed behavior, date tested, environment, and supporting evidence.")}

Retest Status:
${clean(result.retestStatus, "Not Retested")}`;
    })
    .join("\n\n");

  const appendix = results
    .map((result) => {
      const test = tests.find((item) => item.id === result.testCaseId);
      return `- ${testName(result, tests)} (${result.category}; ${result.source || test?.testType || "Custom test"})`;
    })
    .join("\n");

  return `# AI Risk Snapshot Report

## Project

Project: ${project.name}
Client/App: ${project.clientName}
Industry: ${project.industry}
AI System Type: ${project.aiSystemType}
Tester: ${project.testerName}
Assessment Date: ${project.assessmentDate}

## Executive Summary

${executiveSummary}

## Scope

${clean(project.scope)}

## Out of Scope

${clean(project.outOfScope)}

## Methodology

This assessment used a structured AI red team test library mapped to common LLM application risk categories and OWASP-style GenAI risk labels. Each test was manually executed and documented with observed behavior, severity, likelihood, impact, and recommended remediation.

OWASP-style mappings are intended as practical guidance and should be reviewed against the latest OWASP GenAI Top 10 before formal assessments.

Results were scored using severity, likelihood, impact, and observed result status. Passed, failed, and partial results are included in the project risk denominator; not tested and not applicable items are excluded. Risk scores are directional indicators for documented tests, not guarantees that the AI system is secure.

## Key Metrics

* Total Tests Selected: ${results.length}
* Tests Completed: ${completed.length}
* Passed: ${passed}
* Failed: ${failed}
* Partial: ${partial}
* Not Tested: ${notTested}
* Overall Risk Score: ${projectRiskScore}
* Risk Level: ${riskLevel}

## Findings Summary

| ID | Finding | Source | Category | Severity | Status | Risk Score | Recommendation |
| -- | ------- | ------ | -------- | -------- | ------ | ---------- | -------------- |
${findingRows || "| - | No tests selected | - | - | - | - | - | - |"}

## Detailed Findings

${detailedFindings || "No failed or partial findings were documented."}

## Prioritized Recommendations

### Critical Actions

${recommendationLines(groups.critical, tests)}

### High Priority

${recommendationLines(groups.high, tests)}

### Medium / Low Priority

${recommendationLines(groups.mediumLow, tests)}

## Retest Notes

${results
  .filter((result) => result.testerNotes || result.retestStatus !== "Not Retested")
  .map((result) => `- ${testName(result, tests)}: ${result.retestStatus}. ${clean(result.testerNotes, "")}`)
  .join("\n") || "- No retest notes documented."}

## Ethical Testing Statement

This assessment was designed for authorized defensive testing. The findings should be used to improve system safety, reliability, and resilience.

Use this tool only on systems you own or have explicit permission to test.

## Appendix: Tests Used

${appendix || "- No tests selected."}
`;
}
