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

test("seed data includes Safety Lab campaign, templates, and mixed regression runs", () => {
  const db = createSeedWorkbenchDb();
  assert.equal(db.safetyTemplates.length, 8);
  assert.equal(db.safetyCampaigns.length, 1);
  assert.equal(db.safetyRuns.filter((run) => run.resultStatus === "Passed").length, 3);
  assert.equal(db.safetyRuns.filter((run) => run.resultStatus === "Failed").length, 2);
  assert.equal(db.safetyRuns.filter((run) => run.resultStatus === "Partial").length, 2);
  assert.equal(db.safetyRuns.filter((run) => run.resultStatus === "Not Tested").length, 1);
  assert.ok(db.testResults.some((result) => result.source === "Jailbreak & Safety Regression Lab"));
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
