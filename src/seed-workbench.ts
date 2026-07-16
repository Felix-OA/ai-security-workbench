import { writeDb } from "./store.js";
import { createSeedWorkbenchDb } from "./workbench-data.js";

const db = createSeedWorkbenchDb();
await writeDb(db);

console.log(
  `Seeded ${db.testCases.length} test cases, ${db.promptInjectionScenarios.length} playground scenarios, ${db.ragScenarios.length} RAG scenarios, ${db.safetyTemplates.length} safety templates, ${db.safetyCampaigns.length} safety campaign, ${db.projects.length} project, and ${db.testResults.length} test results.`
);
