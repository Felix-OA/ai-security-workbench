import type { Express } from "express";
import { readDb, writeDb } from "../store.js";
import {
  aiSystemTypes,
  categories,
  createSeedWorkbenchDb,
  impacts,
  likelihoods,
  owaspMappings,
  projectStatuses,
  resultStatuses,
  retestStatuses,
  ragRiskLabels,
  ragRiskTypes,
  ragSourceTypes,
  ragTrustLevels,
  safetyCampaignStatuses,
  safetyEnvironments,
  safetyRetestStatuses,
  safetyTestTypes,
  scenarioTypes,
  severities,
  testTypes
} from "../workbench-data.js";

async function ensureRagSeedScenarios(db: Awaited<ReturnType<typeof readDb>>) {
  if (db.ragScenarios.length > 0) return;
  db.ragScenarios = createSeedWorkbenchDb().ragScenarios;
  await writeDb(db);
}

export function registerWorkbenchRoutes(app: Express) {
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/workbench", async (_req, res) => {
    const db = await readDb();
    await ensureRagSeedScenarios(db);
    res.json({
      ...db,
      constants: {
        categories,
        owaspMappings,
        severities,
        testTypes,
        resultStatuses,
        likelihoods,
        impacts,
        retestStatuses,
        projectStatuses,
        aiSystemTypes,
        scenarioTypes,
        ragRiskTypes,
        ragSourceTypes,
        ragTrustLevels,
        ragRiskLabels,
        safetyCampaignStatuses,
        safetyEnvironments,
        safetyTestTypes,
        safetyRetestStatuses
      }
    });
  });

  app.post("/api/workbench/seed", async (_req, res) => {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_RESET !== "true") {
      res.status(403).json({ error: "Demo data reset is disabled in production." });
      return;
    }
    const db = createSeedWorkbenchDb();
    await writeDb(db);
    res.json({ ...db, demoOnly: true });
  });
}
