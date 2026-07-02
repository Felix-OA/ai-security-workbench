import express from "express";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readDb, writeDb, PlaygroundRun, Project, PromptInjectionScenario, TestCase, TestResult } from "./store.js";
import { generateRiskSnapshotReport } from "./report-generator.js";
import { calculateFindingRiskScore, calculateProjectRiskScore, getRiskLevel } from "./scoring.js";
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
  scenarioTypes,
  severities,
  testTypes
} from "./workbench-data.js";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(process.cwd(), "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

function splitTags(value: unknown) {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean);
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function requireFields(body: Record<string, unknown>, fields: string[]) {
  return fields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || String(value).trim() === "";
  });
}

class ValidationError extends Error {
  status = 400;
}

function validationError(message: string): never {
  throw new ValidationError(message);
}

function validateEnum(field: string, value: unknown, allowed: string[], fallback?: string) {
  const candidate = value === undefined || value === null || value === "" ? fallback : String(value);
  if (!candidate) {
    validationError(`${field} is required.`);
  }
  if (!allowed.includes(candidate)) {
    validationError(`${field} must be one of: ${allowed.join(", ")}.`);
  }
  return candidate;
}

function textField(field: string, value: unknown, fallback = "", maxLength = 8000) {
  const text = String(value || fallback || "").trim();
  if (text.length > maxLength) {
    validationError(`${field} must be ${maxLength} characters or fewer.`);
  }
  return text;
}

function handleValidation(error: unknown, res: express.Response) {
  if (error instanceof ValidationError) {
    res.status(error.status).json({ error: error.message });
    return true;
  }
  return false;
}

function rubricFallbacks(test: Pick<TestCase, "expectedBehavior" | "failureIndicators">) {
  return {
    evaluationCriteria: "Compare the observed behavior against the expected safe behavior and failure indicators.",
    passCondition: test.expectedBehavior || "The system follows the expected safe behavior.",
    failCondition: test.failureIndicators || "The system exhibits one or more documented failure indicators.",
    partialCondition: "The system mostly behaves safely but shows incomplete, ambiguous, or weak handling.",
    evidenceGuidance:
      "Record the exact prompt/input, observed response summary, date tested, environment, and any screenshots or evidence URLs."
  };
}

function createTestCase(body: Record<string, unknown>, existing?: TestCase): TestCase {
  const now = new Date().toISOString();
  const expectedBehavior = String(body.expectedBehavior || existing?.expectedBehavior || "").trim();
  const failureIndicators = String(body.failureIndicators || existing?.failureIndicators || "").trim();
  const fallback = rubricFallbacks({ expectedBehavior, failureIndicators });
  return {
    id: existing?.id || randomUUID(),
    name: String(body.name || existing?.name || "").trim(),
    description: String(body.description || existing?.description || "").trim(),
    category: validateEnum("Category", body.category, categories, existing?.category || categories[0]),
    owaspMapping: validateEnum("OWASP mapping", body.owaspMapping, owaspMappings, existing?.owaspMapping || owaspMappings[0]),
    testType: validateEnum("Test type", body.testType, testTypes, existing?.testType || testTypes[0]),
    severity: validateEnum("Severity", body.severity, severities, existing?.severity || "Medium"),
    prompt: String(body.prompt || existing?.prompt || "").trim(),
    expectedBehavior,
    failureIndicators,
    recommendedMitigation: String(body.recommendedMitigation || existing?.recommendedMitigation || "").trim(),
    evaluationCriteria: String(body.evaluationCriteria || existing?.evaluationCriteria || fallback.evaluationCriteria).trim(),
    passCondition: String(body.passCondition || existing?.passCondition || fallback.passCondition).trim(),
    failCondition: String(body.failCondition || existing?.failCondition || fallback.failCondition).trim(),
    partialCondition: String(body.partialCondition || existing?.partialCondition || fallback.partialCondition).trim(),
    evidenceGuidance: String(body.evidenceGuidance || existing?.evidenceGuidance || fallback.evidenceGuidance).trim(),
    tags: splitTags(body.tags ?? existing?.tags ?? []),
    notes: String(body.notes || existing?.notes || "").trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

function createProject(body: Record<string, unknown>, existing?: Project): Project {
  const now = new Date().toISOString();
  return {
    id: existing?.id || randomUUID(),
    name: String(body.name || existing?.name || "").trim(),
    clientName: String(body.clientName || existing?.clientName || "").trim(),
    industry: String(body.industry || existing?.industry || "").trim(),
    aiSystemType: validateEnum("AI system type", body.aiSystemType, aiSystemTypes, existing?.aiSystemType || aiSystemTypes[0]),
    objective: String(body.objective || existing?.objective || "").trim(),
    scope: String(body.scope || existing?.scope || "").trim(),
    outOfScope: String(body.outOfScope || existing?.outOfScope || "").trim(),
    testerName: String(body.testerName || existing?.testerName || "").trim(),
    assessmentDate: String(body.assessmentDate || existing?.assessmentDate || now.slice(0, 10)),
    status: validateEnum("Status", body.status, projectStatuses, existing?.status || "Draft"),
    authorizationConfirmed: body.authorizationConfirmed === true || body.authorizationConfirmed === "true",
    notes: String(body.notes || existing?.notes || "").trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

function createResult(body: Record<string, unknown>, projectId: string, existing?: TestResult): TestResult {
  const now = new Date().toISOString();
  const severity = validateEnum("Severity", body.severity, severities, existing?.severity || "Medium");
  const likelihood = validateEnum("Likelihood", body.likelihood, likelihoods, existing?.likelihood || "Medium");
  const impact = validateEnum("Impact", body.impact, impacts, existing?.impact || "Medium");
  const resultStatus = validateEnum("Result status", body.resultStatus, resultStatuses, existing?.resultStatus || "Not Tested");
  return {
    id: existing?.id || randomUUID(),
    projectId,
    testCaseId: String(body.testCaseId ?? existing?.testCaseId ?? ""),
    source: (["Test Library", "Prompt Injection Playground", "Custom"].includes(String(body.source || existing?.source || ""))
      ? String(body.source || existing?.source)
      : existing?.testCaseId || body.testCaseId
        ? "Test Library"
        : "Custom") as TestResult["source"],
    playgroundRunId: String(body.playgroundRunId || existing?.playgroundRunId || ""),
    scenarioType: String(body.scenarioType || existing?.scenarioType || ""),
    systemPrompt: String(body.systemPrompt || existing?.systemPrompt || "").trim(),
    retrievedContext: String(body.retrievedContext || existing?.retrievedContext || "").trim(),
    evaluationCriteria: String(body.evaluationCriteria || existing?.evaluationCriteria || "").trim(),
    customTestName: String(body.customTestName || existing?.customTestName || "").trim(),
    category: validateEnum("Category", body.category, categories, existing?.category || categories[0]),
    owaspMapping: validateEnum("OWASP mapping", body.owaspMapping, owaspMappings, existing?.owaspMapping || owaspMappings[0]),
    severity,
    actualPrompt: String(body.actualPrompt || existing?.actualPrompt || "").trim(),
    modelResponse: String(body.modelResponse || existing?.modelResponse || "").trim(),
    resultStatus,
    likelihood,
    impact,
    riskScore: calculateFindingRiskScore(severity, likelihood, impact, resultStatus),
    evidenceNotes: String(body.evidenceNotes || existing?.evidenceNotes || "").trim(),
    evidenceUrl: String(body.evidenceUrl || existing?.evidenceUrl || "").trim(),
    recommendation: String(body.recommendation || existing?.recommendation || "").trim(),
    retestStatus: validateEnum("Retest status", body.retestStatus, retestStatuses, existing?.retestStatus || "Not Retested"),
    testerNotes: String(body.testerNotes || existing?.testerNotes || "").trim(),
    dateTested: String(body.dateTested || existing?.dateTested || now.slice(0, 10)),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

function createScenario(body: Record<string, unknown>, existing?: PromptInjectionScenario): PromptInjectionScenario {
  const now = new Date().toISOString();
  return {
    id: existing?.id || randomUUID(),
    name: textField("Name", body.name, existing?.name, 160),
    description: textField("Description", body.description, existing?.description, 1000),
    scenarioType: validateEnum("Scenario type", body.scenarioType, scenarioTypes, existing?.scenarioType || scenarioTypes[0]),
    category: validateEnum("Category", body.category, categories, existing?.category || categories[0]),
    owaspMapping: validateEnum("OWASP mapping", body.owaspMapping, owaspMappings, existing?.owaspMapping || owaspMappings[0]),
    severity: validateEnum("Severity", body.severity, severities, existing?.severity || "Medium"),
    systemPrompt: textField("System prompt", body.systemPrompt, existing?.systemPrompt),
    userPrompt: textField("User prompt", body.userPrompt, existing?.userPrompt),
    retrievedContext: textField("Retrieved context", body.retrievedContext, existing?.retrievedContext),
    expectedSafeBehavior: textField("Expected safe behavior", body.expectedSafeBehavior, existing?.expectedSafeBehavior),
    failureIndicators: textField("Failure indicators", body.failureIndicators, existing?.failureIndicators),
    evaluationCriteria: textField("Evaluation criteria", body.evaluationCriteria, existing?.evaluationCriteria),
    passCondition: textField("Pass condition", body.passCondition, existing?.passCondition, 2000),
    partialCondition: textField("Partial condition", body.partialCondition, existing?.partialCondition, 2000),
    failCondition: textField("Fail condition", body.failCondition, existing?.failCondition, 2000),
    recommendedMitigation: textField("Recommended mitigation", body.recommendedMitigation, existing?.recommendedMitigation),
    tags: splitTags(body.tags ?? existing?.tags ?? []),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

function createPlaygroundRun(body: Record<string, unknown>, existing?: PlaygroundRun): PlaygroundRun {
  const now = new Date().toISOString();
  const severity = validateEnum("Severity", body.severity, severities, existing?.severity || "Medium");
  const likelihood = validateEnum("Likelihood", body.likelihood, likelihoods, existing?.likelihood || "Medium");
  const impact = validateEnum("Impact", body.impact, impacts, existing?.impact || "Medium");
  const resultStatus = validateEnum("Result status", body.resultStatus, resultStatuses, existing?.resultStatus || "Not Tested");
  return {
    id: existing?.id || randomUUID(),
    scenarioId: String(body.scenarioId || existing?.scenarioId || ""),
    projectId: String(body.projectId || existing?.projectId || ""),
    testResultId: String(body.testResultId || existing?.testResultId || ""),
    name: textField("Name", body.name, existing?.name, 160),
    scenarioType: validateEnum("Scenario type", body.scenarioType, scenarioTypes, existing?.scenarioType || scenarioTypes[0]),
    category: validateEnum("Category", body.category, categories, existing?.category || categories[0]),
    owaspMapping: validateEnum("OWASP mapping", body.owaspMapping, owaspMappings, existing?.owaspMapping || owaspMappings[0]),
    severity,
    systemPrompt: textField("System prompt", body.systemPrompt, existing?.systemPrompt),
    userPrompt: textField("User prompt", body.userPrompt, existing?.userPrompt),
    retrievedContext: textField("Retrieved context", body.retrievedContext, existing?.retrievedContext),
    expectedSafeBehavior: textField("Expected safe behavior", body.expectedSafeBehavior, existing?.expectedSafeBehavior),
    failureIndicators: textField("Failure indicators", body.failureIndicators, existing?.failureIndicators),
    evaluationCriteria: textField("Evaluation criteria", body.evaluationCriteria, existing?.evaluationCriteria),
    actualResponse: textField("Actual response", body.actualResponse, existing?.actualResponse),
    resultStatus,
    likelihood,
    impact,
    riskScore: calculateFindingRiskScore(severity, likelihood, impact, resultStatus),
    evidenceNotes: textField("Evidence notes", body.evidenceNotes, existing?.evidenceNotes),
    recommendation: textField("Recommendation", body.recommendation, existing?.recommendation),
    testerNotes: textField("Tester notes", body.testerNotes, existing?.testerNotes),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

function requireKnownScenario(db: Awaited<ReturnType<typeof readDb>>, scenarioId: string) {
  if (!scenarioId) return;
  if (!db.promptInjectionScenarios.some((scenario) => scenario.id === scenarioId)) {
    validationError("Scenario not found.");
  }
}

function resultFromRun(run: PlaygroundRun, projectId: string, existing?: TestResult): TestResult {
  return createResult(
    {
      source: "Prompt Injection Playground",
      playgroundRunId: run.id,
      scenarioType: run.scenarioType,
      systemPrompt: run.systemPrompt,
      retrievedContext: run.retrievedContext,
      evaluationCriteria: run.evaluationCriteria,
      customTestName: run.name,
      category: run.category,
      owaspMapping: run.owaspMapping,
      severity: run.severity,
      actualPrompt: [
        run.systemPrompt ? `System / intended behavior:\n${run.systemPrompt}` : "",
        `User prompt:\n${run.userPrompt}`,
        run.retrievedContext ? `Simulated retrieved context:\n${run.retrievedContext}` : ""
      ]
        .filter(Boolean)
        .join("\n\n"),
      modelResponse: run.actualResponse,
      resultStatus: run.resultStatus,
      likelihood: run.likelihood,
      impact: run.impact,
      evidenceNotes: run.evidenceNotes,
      recommendation: run.recommendation,
      testerNotes: run.testerNotes,
      retestStatus: "Not Retested"
    },
    projectId,
    existing
  );
}

function projectSummary(project: Project, results: TestResult[]) {
  const projectResults = results.filter((result) => result.projectId === project.id);
  const score = calculateProjectRiskScore(projectResults);
  return {
    ...project,
    riskScore: score,
    riskLevel: getRiskLevel(score),
    testCount: projectResults.length,
    failedCount: projectResults.filter((result) => result.resultStatus === "Failed").length
  };
}

app.get("/api/workbench", async (_req, res) => {
  const db = await readDb();
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
      scenarioTypes
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

app.get("/api/tests", async (_req, res) => {
  const db = await readDb();
  res.json(db.testCases);
});

app.post("/api/tests", async (req, res) => {
  const missing = requireFields(req.body || {}, [
    "name",
    "category",
    "severity",
    "prompt",
    "expectedBehavior",
    "failureIndicators",
    "recommendedMitigation"
  ]);
  if (missing.length > 0) {
    res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
    return;
  }
  const db = await readDb();
  let test: TestCase;
  try {
    test = createTestCase(req.body || {});
  } catch (error) {
    if (handleValidation(error, res)) return;
    throw error;
  }
  db.testCases.unshift(test);
  await writeDb(db);
  res.status(201).json(test);
});

app.get("/api/tests/:id", async (req, res) => {
  const db = await readDb();
  const test = db.testCases.find((item) => item.id === req.params.id);
  if (!test) {
    res.status(404).json({ error: "test not found" });
    return;
  }
  res.json(test);
});

app.put("/api/tests/:id", async (req, res) => {
  const db = await readDb();
  const index = db.testCases.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: "test not found" });
    return;
  }
  let test: TestCase;
  try {
    test = createTestCase(req.body || {}, db.testCases[index]);
  } catch (error) {
    if (handleValidation(error, res)) return;
    throw error;
  }
  db.testCases[index] = test;
  db.testResults
    .filter((result) => result.testCaseId === test.id)
    .forEach((result) => {
      result.category = test.category;
      result.owaspMapping = test.owaspMapping;
      result.updatedAt = new Date().toISOString();
    });
  await writeDb(db);
  res.json(test);
});

app.post("/api/tests/:id/duplicate", async (req, res) => {
  const db = await readDb();
  const test = db.testCases.find((item) => item.id === req.params.id);
  if (!test) {
    res.status(404).json({ error: "test not found" });
    return;
  }
  const now = new Date().toISOString();
  const duplicate: TestCase = {
    ...test,
    id: randomUUID(),
    name: `${test.name} copy`,
    createdAt: now,
    updatedAt: now
  };
  db.testCases.unshift(duplicate);
  await writeDb(db);
  res.status(201).json(duplicate);
});

app.delete("/api/tests/:id", async (req, res) => {
  const db = await readDb();
  db.testCases = db.testCases.filter((item) => item.id !== req.params.id);
  db.testResults.forEach((result) => {
    if (result.testCaseId === req.params.id) result.testCaseId = "";
  });
  await writeDb(db);
  res.json({ ok: true });
});

app.get("/api/projects", async (_req, res) => {
  const db = await readDb();
  res.json(db.projects.map((project) => projectSummary(project, db.testResults)));
});

app.post("/api/projects", async (req, res) => {
  const missing = requireFields(req.body || {}, [
    "name",
    "clientName",
    "industry",
    "aiSystemType",
    "objective",
    "scope",
    "testerName"
  ]);
  if (missing.length > 0) {
    res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
    return;
  }
  if (req.body?.authorizationConfirmed !== true && req.body?.authorizationConfirmed !== "true") {
    res.status(400).json({ error: "Authorization confirmation is required." });
    return;
  }
  const db = await readDb();
  let project: Project;
  try {
    project = createProject(req.body || {});
  } catch (error) {
    if (handleValidation(error, res)) return;
    throw error;
  }
  db.projects.unshift(project);
  await writeDb(db);
  res.status(201).json(project);
});

app.get("/api/projects/:id", async (req, res) => {
  const db = await readDb();
  const project = db.projects.find((item) => item.id === req.params.id);
  if (!project) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  const results = db.testResults.filter((result) => result.projectId === project.id);
  res.json({
    project: projectSummary(project, db.testResults),
    results,
    tests: db.testCases
  });
});

app.put("/api/projects/:id", async (req, res) => {
  const db = await readDb();
  const index = db.projects.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  if (req.body?.authorizationConfirmed !== true && req.body?.authorizationConfirmed !== "true") {
    res.status(400).json({ error: "Authorization confirmation is required." });
    return;
  }
  let project: Project;
  try {
    project = createProject(req.body || {}, db.projects[index]);
  } catch (error) {
    if (handleValidation(error, res)) return;
    throw error;
  }
  db.projects[index] = project;
  await writeDb(db);
  res.json(projectSummary(project, db.testResults));
});

app.delete("/api/projects/:id", async (req, res) => {
  const db = await readDb();
  db.projects = db.projects.filter((item) => item.id !== req.params.id);
  db.testResults = db.testResults.filter((result) => result.projectId !== req.params.id);
  await writeDb(db);
  res.json({ ok: true });
});

app.post("/api/projects/:id/add-tests", async (req, res) => {
  const db = await readDb();
  const project = db.projects.find((item) => item.id === req.params.id);
  if (!project) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  const ids = Array.isArray(req.body?.testCaseIds) ? req.body.testCaseIds.map(String) : [];
  const now = new Date().toISOString();
  const existing = new Set(
    db.testResults
      .filter((result) => result.projectId === project.id && result.testCaseId)
      .map((result) => result.testCaseId)
  );
  const created = db.testCases
    .filter((test) => ids.includes(test.id) && !existing.has(test.id))
    .map((test): TestResult => ({
      id: randomUUID(),
      projectId: project.id,
      testCaseId: test.id,
      source: "Test Library",
      playgroundRunId: "",
      scenarioType: "",
      systemPrompt: "",
      retrievedContext: "",
      evaluationCriteria: test.evaluationCriteria,
      customTestName: "",
      category: test.category,
      owaspMapping: test.owaspMapping,
      severity: test.severity,
      actualPrompt: test.prompt,
      modelResponse: "",
      resultStatus: "Not Tested",
      likelihood: "Medium",
      impact: "Medium",
      riskScore: 0,
      evidenceNotes: "",
      evidenceUrl: "",
      recommendation: test.recommendedMitigation,
      retestStatus: "Not Retested",
      testerNotes: "",
      dateTested: now.slice(0, 10),
      createdAt: now,
      updatedAt: now
    }));
  db.testResults.push(...created);
  project.updatedAt = now;
  await writeDb(db);
  res.status(201).json(created);
});

app.get("/api/playground/scenarios", async (_req, res) => {
  const db = await readDb();
  res.json(db.promptInjectionScenarios);
});

app.post("/api/playground/scenarios", async (req, res) => {
  const missing = requireFields(req.body || {}, [
    "name",
    "scenarioType",
    "category",
    "severity",
    "userPrompt",
    "expectedSafeBehavior",
    "failureIndicators",
    "recommendedMitigation"
  ]);
  if (missing.length > 0) {
    res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
    return;
  }
  const db = await readDb();
  let scenario: PromptInjectionScenario;
  try {
    scenario = createScenario(req.body || {});
  } catch (error) {
    if (handleValidation(error, res)) return;
    throw error;
  }
  db.promptInjectionScenarios.unshift(scenario);
  await writeDb(db);
  res.status(201).json(scenario);
});

app.put("/api/playground/scenarios/:id", async (req, res) => {
  const db = await readDb();
  const index = db.promptInjectionScenarios.findIndex((scenario) => scenario.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: "scenario not found" });
    return;
  }
  let scenario: PromptInjectionScenario;
  try {
    scenario = createScenario(req.body || {}, db.promptInjectionScenarios[index]);
  } catch (error) {
    if (handleValidation(error, res)) return;
    throw error;
  }
  db.promptInjectionScenarios[index] = scenario;
  await writeDb(db);
  res.json(scenario);
});

app.post("/api/playground/scenarios/:id/duplicate", async (req, res) => {
  const db = await readDb();
  const scenario = db.promptInjectionScenarios.find((item) => item.id === req.params.id);
  if (!scenario) {
    res.status(404).json({ error: "scenario not found" });
    return;
  }
  const now = new Date().toISOString();
  const duplicate: PromptInjectionScenario = {
    ...scenario,
    id: randomUUID(),
    name: `${scenario.name} copy`,
    createdAt: now,
    updatedAt: now
  };
  db.promptInjectionScenarios.unshift(duplicate);
  await writeDb(db);
  res.status(201).json(duplicate);
});

app.delete("/api/playground/scenarios/:id", async (req, res) => {
  const db = await readDb();
  db.promptInjectionScenarios = db.promptInjectionScenarios.filter((scenario) => scenario.id !== req.params.id);
  db.playgroundRuns.forEach((run) => {
    if (run.scenarioId === req.params.id) run.scenarioId = "";
  });
  await writeDb(db);
  res.json({ ok: true });
});

app.post("/api/playground/scenarios/:id/test-case", async (req, res) => {
  const db = await readDb();
  const scenario = db.promptInjectionScenarios.find((item) => item.id === req.params.id);
  if (!scenario) {
    res.status(404).json({ error: "scenario not found" });
    return;
  }
  let test: TestCase;
  try {
    test = createTestCase({
      name: scenario.name,
      description: scenario.description,
      category: scenario.category,
      owaspMapping: scenario.owaspMapping,
      testType: scenario.scenarioType === "RAG Context Injection" ? "RAG document test" : "Direct prompt test",
      severity: scenario.severity,
      prompt: [scenario.userPrompt, scenario.retrievedContext ? `Simulated context:\n${scenario.retrievedContext}` : ""]
        .filter(Boolean)
        .join("\n\n"),
      expectedBehavior: scenario.expectedSafeBehavior,
      failureIndicators: scenario.failureIndicators,
      recommendedMitigation: scenario.recommendedMitigation,
      evaluationCriteria: scenario.evaluationCriteria,
      passCondition: scenario.passCondition,
      failCondition: scenario.failCondition,
      partialCondition: scenario.partialCondition,
      evidenceGuidance: "Record the playground run, observed model/app response, evidence notes, and the selected evaluation outcome.",
      tags: [...scenario.tags, "playground", scenario.scenarioType.toLowerCase().replaceAll(" ", "-")]
    });
  } catch (error) {
    if (handleValidation(error, res)) return;
    throw error;
  }
  db.testCases.unshift(test);
  await writeDb(db);
  res.status(201).json(test);
});

app.get("/api/playground/runs", async (_req, res) => {
  const db = await readDb();
  res.json(db.playgroundRuns);
});

app.get("/api/playground/runs/:id", async (req, res) => {
  const db = await readDb();
  const run = db.playgroundRuns.find((item) => item.id === req.params.id);
  if (!run) {
    res.status(404).json({ error: "run not found" });
    return;
  }
  res.json(run);
});

app.post("/api/playground/runs", async (req, res) => {
  const missing = requireFields(req.body || {}, [
    "name",
    "category",
    "severity",
    "actualResponse",
    "resultStatus",
    "likelihood",
    "impact",
    "recommendation"
  ]);
  if (missing.length > 0) {
    res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
    return;
  }
  const db = await readDb();
  let run: PlaygroundRun;
  try {
    requireKnownScenario(db, String(req.body?.scenarioId || ""));
    run = createPlaygroundRun(req.body || {});
  } catch (error) {
    if (handleValidation(error, res)) return;
    throw error;
  }
  db.playgroundRuns.unshift(run);
  await writeDb(db);
  res.status(201).json(run);
});

app.put("/api/playground/runs/:id", async (req, res) => {
  const db = await readDb();
  const index = db.playgroundRuns.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: "run not found" });
    return;
  }
  let run: PlaygroundRun;
  try {
    requireKnownScenario(db, String(req.body?.scenarioId || db.playgroundRuns[index].scenarioId || ""));
    run = createPlaygroundRun(req.body || {}, db.playgroundRuns[index]);
  } catch (error) {
    if (handleValidation(error, res)) return;
    throw error;
  }
  db.playgroundRuns[index] = run;
  await writeDb(db);
  res.json(run);
});

app.post("/api/playground/runs/:id/save-to-project", async (req, res) => {
  const db = await readDb();
  const run = db.playgroundRuns.find((item) => item.id === req.params.id);
  if (!run) {
    res.status(404).json({ error: "run not found" });
    return;
  }
  const projectId = String(req.body?.projectId || run.projectId || "");
  const project = db.projects.find((item) => item.id === projectId);
  if (!project) {
    res.status(400).json({ error: "Select an existing project before saving this run." });
    return;
  }
  let result: TestResult;
  const existingResultIndex = db.testResults.findIndex(
    (item) => item.id === run.testResultId && item.projectId === project.id
  );
  const existingResult = existingResultIndex === -1 ? undefined : db.testResults[existingResultIndex];
  try {
    result = resultFromRun(run, project.id, existingResult);
  } catch (error) {
    if (handleValidation(error, res)) return;
    throw error;
  }
  if (existingResultIndex === -1) {
    db.testResults.push(result);
  } else {
    db.testResults[existingResultIndex] = result;
  }
  run.projectId = project.id;
  run.testResultId = result.id;
  run.updatedAt = new Date().toISOString();
  project.updatedAt = run.updatedAt;
  await writeDb(db);
  res.status(201).json({ run, result, project: projectSummary(project, db.testResults) });
});

app.post("/api/projects/:id/results", async (req, res) => {
  const missing = requireFields(req.body || {}, [
    "category",
    "severity",
    "actualPrompt",
    "resultStatus",
    "likelihood",
    "impact",
    "recommendation"
  ]);
  if (missing.length > 0) {
    res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
    return;
  }
  const db = await readDb();
  const project = db.projects.find((item) => item.id === req.params.id);
  if (!project) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  let result: TestResult;
  try {
    result = createResult(req.body || {}, project.id);
  } catch (error) {
    if (handleValidation(error, res)) return;
    throw error;
  }
  db.testResults.push(result);
  project.updatedAt = new Date().toISOString();
  await writeDb(db);
  res.status(201).json(result);
});

app.put("/api/projects/:id/results/:resultId", async (req, res) => {
  const db = await readDb();
  const index = db.testResults.findIndex(
    (result) => result.projectId === req.params.id && result.id === req.params.resultId
  );
  if (index === -1) {
    res.status(404).json({ error: "result not found" });
    return;
  }
  let result: TestResult;
  try {
    result = createResult(req.body || {}, req.params.id, db.testResults[index]);
  } catch (error) {
    if (handleValidation(error, res)) return;
    throw error;
  }
  db.testResults[index] = result;
  const project = db.projects.find((item) => item.id === req.params.id);
  if (project) project.updatedAt = new Date().toISOString();
  await writeDb(db);
  res.json(result);
});

app.delete("/api/projects/:id/results/:resultId", async (req, res) => {
  const db = await readDb();
  db.testResults = db.testResults.filter(
    (result) => !(result.projectId === req.params.id && result.id === req.params.resultId)
  );
  await writeDb(db);
  res.json({ ok: true });
});

app.get("/api/projects/:id/report", async (req, res) => {
  const db = await readDb();
  const project = db.projects.find((item) => item.id === req.params.id);
  if (!project) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  const results = db.testResults.filter((result) => result.projectId === project.id);
  res.json({ markdown: generateRiskSnapshotReport(project, results, db.testCases) });
});

export { app };

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  app.listen(port, () => {
    console.log(`AI Security Workbench running on http://localhost:${port}`);
  });
}
