import test from "node:test";
import assert from "node:assert/strict";
import { calculateFindingRiskScore } from "./scoring.js";
import { createSeedWorkbenchDb, scenarioTypes } from "./workbench-data.js";

test("seed data includes defensive prompt injection playground scenarios", () => {
  const db = createSeedWorkbenchDb();
  assert.equal(db.promptInjectionScenarios.length, 8);
  assert.ok(scenarioTypes.includes("RAG Context Injection"));
  assert.ok(scenarioTypes.includes("Tool Output Injection"));
  assert.ok(db.promptInjectionScenarios.every((scenario) => scenario.userPrompt && scenario.expectedSafeBehavior));
});

test("seeded result scores stay aligned with scoring utility", () => {
  const db = createSeedWorkbenchDb();
  for (const result of db.testResults) {
    assert.equal(
      result.riskScore,
      calculateFindingRiskScore(result.severity, result.likelihood, result.impact, result.resultStatus)
    );
  }
});
