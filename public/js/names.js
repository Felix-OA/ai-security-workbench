import { state } from "./state.js";

export function testName(result) {
  return result.customTestName || state.testCases.find((test) => test.id === result.testCaseId)?.name || "Custom test";
}

export function scenarioName(run) {
  return run.name || state.promptInjectionScenarios.find((scenario) => scenario.id === run.scenarioId)?.name || "Playground run";
}

export function ragScenarioName(run) {
  return run.name || state.ragScenarios.find((scenario) => scenario.id === run.scenarioId)?.name || "RAG Lab run";
}

