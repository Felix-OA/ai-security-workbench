import test from "node:test";
import assert from "node:assert/strict";
import { calculateFindingRiskScore, calculateProjectRiskScore, getRiskLevel } from "./scoring.js";

test("calculates individual failed finding risk", () => {
  assert.equal(calculateFindingRiskScore("Critical", "High", "High", "Failed"), 22.5);
});

test("calculates partial finding risk rounded to one decimal", () => {
  assert.equal(calculateFindingRiskScore("High", "Medium", "High", "Partial"), 6.6);
});

test("passed findings score zero", () => {
  assert.equal(calculateFindingRiskScore("Medium", "Low", "Medium", "Passed"), 0);
});

test("calculates project risk score from completed results only", () => {
  const score = calculateProjectRiskScore([
    { severity: "Critical", likelihood: "High", impact: "High", resultStatus: "Failed" },
    { severity: "Critical", likelihood: "High", impact: "High", resultStatus: "Passed" },
    { severity: "Critical", likelihood: "High", impact: "High", resultStatus: "Not Tested" }
  ]);
  assert.equal(score, 50);
});

test("maps risk levels", () => {
  assert.equal(getRiskLevel(0), "Low");
  assert.equal(getRiskLevel(25), "Medium");
  assert.equal(getRiskLevel(50), "High");
  assert.equal(getRiskLevel(75), "Critical");
});
