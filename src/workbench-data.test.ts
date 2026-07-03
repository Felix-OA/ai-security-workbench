import test from "node:test";
import assert from "node:assert/strict";
import { calculateFindingRiskScore } from "./scoring.js";
import { createSeedWorkbenchDb, ragRiskTypes, scenarioTypes } from "./workbench-data.js";

test("seed data includes defensive prompt injection playground scenarios", () => {
  const db = createSeedWorkbenchDb();
  assert.equal(db.promptInjectionScenarios.length, 8);
  assert.ok(scenarioTypes.includes("RAG Context Injection"));
  assert.ok(scenarioTypes.includes("Tool Output Injection"));
  assert.ok(db.promptInjectionScenarios.every((scenario) => scenario.userPrompt && scenario.expectedSafeBehavior));
});

test("seed data includes defensive RAG Attack Lab scenarios", () => {
  const db = createSeedWorkbenchDb();
  assert.equal(db.ragScenarios.length, 6);
  assert.ok(ragRiskTypes.includes("Malicious Retrieved Document"));
  assert.ok(db.ragScenarios.every((scenario) => scenario.userQuestion && scenario.retrievedChunks.length >= 1));
  assert.ok(db.ragScenarios.some((scenario) => scenario.retrievedChunks.some((chunk) => chunk.trustLevel === "Untrusted")));
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
