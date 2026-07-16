import { fetchJson } from "./api.js";

export const state = {
  constants: {},
  testCases: [],
  projects: [],
  testResults: [],
  promptInjectionScenarios: [],
  playgroundRuns: [],
  ragScenarios: [],
  ragRuns: [],
  safetyCampaigns: [],
  safetyTemplates: [],
  safetyRuns: []
};

export async function loadState() {
  const data = await fetchJson("/api/workbench");
  Object.assign(state, {
    constants: data.constants,
    testCases: data.testCases,
    projects: await fetchJson("/api/projects"),
    testResults: data.testResults,
    promptInjectionScenarios: data.promptInjectionScenarios || [],
    playgroundRuns: data.playgroundRuns || [],
    ragScenarios: data.ragScenarios || [],
    ragRuns: data.ragRuns || [],
    safetyCampaigns: data.safetyCampaigns || [],
    safetyTemplates: data.safetyTemplates || [],
    safetyRuns: data.safetyRuns || []
  });
}
