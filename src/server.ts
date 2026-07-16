import express from "express";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  readDb,
  writeDb,
  PlaygroundRun,
  Project,
  PromptInjectionScenario,
  RagRun,
  RagScenario,
  RetrievedChunk,
  SafetyCampaign,
  SafetyRun,
  SafetyTemplate,
  TestCase,
  TestResult
} from "./store.js";
import { generateRiskSnapshotReport } from "./report-generator.js";
import { calculateFindingRiskScore, calculateProjectRiskScore, getRiskLevel } from "./scoring.js";
import { registerWorkbenchRoutes } from "./routes/workbench-routes.js";
import { sourceLabel, sourceValues } from "./source-labels.js";
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
} from "./workbench-data.js";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(process.cwd(), "public")));
registerWorkbenchRoutes(app);

function splitTags(value: unknown) {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean);
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function summarizeText(value: string, maxLength = 220) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
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

function requiredTextField(field: string, value: unknown, fallback = "", maxLength = 8000) {
  const text = textField(field, value, fallback, maxLength);
  if (!text) {
    validationError(`${field} is required.`);
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
  const rawSource = String(body.source || existing?.source || "");
  return {
    id: existing?.id || randomUUID(),
    projectId,
    testCaseId: String(body.testCaseId ?? existing?.testCaseId ?? ""),
    source: (sourceValues.includes(rawSource as TestResult["source"])
      ? sourceLabel(rawSource)
      : existing?.testCaseId || body.testCaseId
        ? "Test Library"
        : "Custom") as TestResult["source"],
    playgroundRunId: String(body.playgroundRunId || existing?.playgroundRunId || ""),
    ragRunId: String(body.ragRunId || existing?.ragRunId || ""),
    safetyRunId: String(body.safetyRunId || existing?.safetyRunId || ""),
    safetyCampaignId: String(body.safetyCampaignId || existing?.safetyCampaignId || ""),
    campaignName: String(body.campaignName || existing?.campaignName || "").trim(),
    targetSystem: String(body.targetSystem || existing?.targetSystem || "").trim(),
    modelVersion: String(body.modelVersion || existing?.modelVersion || "").trim(),
    safetyTestType: String(body.safetyTestType || existing?.safetyTestType || "").trim(),
    scenarioType: String(body.scenarioType || existing?.scenarioType || ""),
    ragRiskType: String(body.ragRiskType || existing?.ragRiskType || ""),
    systemPrompt: String(body.systemPrompt || existing?.systemPrompt || "").trim(),
    retrievedContext: String(body.retrievedContext || existing?.retrievedContext || "").trim(),
    retrievedContextSummary: String(body.retrievedContextSummary || existing?.retrievedContextSummary || "").trim(),
    untrustedChunksSummary: String(body.untrustedChunksSummary || existing?.untrustedChunksSummary || "").trim(),
    userQuestion: String(body.userQuestion || existing?.userQuestion || "").trim(),
    expectedSafeBehavior: String(body.expectedSafeBehavior || existing?.expectedSafeBehavior || "").trim(),
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
    mitigationNotes: String(body.mitigationNotes || existing?.mitigationNotes || "").trim(),
    testerNotes: String(body.testerNotes || existing?.testerNotes || "").trim(),
    dateTested: String(body.dateTested || existing?.dateTested || now.slice(0, 10)),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

function createRetrievedChunk(body: Record<string, unknown>, existing?: RetrievedChunk): RetrievedChunk {
  const now = new Date().toISOString();
  return {
    id: String(body.id || existing?.id || randomUUID()),
    title: requiredTextField("Chunk title", body.title, existing?.title, 160),
    sourceName: requiredTextField("Source name", body.sourceName, existing?.sourceName, 160),
    sourceType: validateEnum("Source type", body.sourceType, ragSourceTypes, existing?.sourceType),
    trustLevel: validateEnum("Trust level", body.trustLevel, ragTrustLevels, existing?.trustLevel),
    riskLabel: validateEnum("Risk label", body.riskLabel, ragRiskLabels, existing?.riskLabel),
    content: requiredTextField("Chunk content", body.content, existing?.content, 8000),
    includeInRetrieval:
      body.includeInRetrieval === undefined
        ? existing?.includeInRetrieval ?? true
        : body.includeInRetrieval === true || body.includeInRetrieval === "true",
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

function createRetrievedChunks(value: unknown, existing: RetrievedChunk[] = []) {
  const rawChunks = Array.isArray(value) ? value : [];
  if (rawChunks.length === 0) validationError("At least one retrieved chunk is required.");
  if (rawChunks.length > 5) validationError("Retrieved context supports up to 5 chunks in this version.");
  const chunks = rawChunks.map((raw, index) => {
    const body = (raw || {}) as Record<string, unknown>;
    const previous = existing.find((chunk) => chunk.id === body.id);
    const chunk = createRetrievedChunk(body, previous);
    return chunk;
  });
  if (!chunks.some((chunk) => chunk.includeInRetrieval)) {
    validationError("At least one retrieved chunk must be included in retrieval.");
  }
  return chunks;
}

function maxBacktickRun(value: string) {
  return Math.max(0, ...Array.from(value.matchAll(/`+/g)).map((match) => match[0].length));
}

function fencedTextBlock(value: string) {
  const fence = "`".repeat(Math.max(3, maxBacktickRun(value) + 1));
  return `${fence}text\n${value}\n${fence}`;
}

function retrievedContextReport(chunks: RetrievedChunk[]) {
  const included = chunks.filter((chunk) => chunk.includeInRetrieval);
  return included
    .map(
      (chunk, index) => `Chunk ${index + 1}: ${chunk.title}
Source: ${chunk.sourceName}
Source Type: ${chunk.sourceType}
Trust Level: ${chunk.trustLevel}
Risk Label: ${chunk.riskLabel}

${fencedTextBlock(chunk.content)}`
    )
    .join("\n\n");
}

function riskyChunkReport(chunks: RetrievedChunk[]) {
  const risky = chunks.filter(
    (chunk) => chunk.includeInRetrieval && (chunk.trustLevel !== "Trusted" || chunk.riskLabel !== "Clean")
  );
  return risky.length ? retrievedContextReport(risky) : "No untrusted or risky retrieved chunks documented.";
}

function retrievedContextSummary(chunks: RetrievedChunk[]) {
  return chunks
    .filter((chunk) => chunk.includeInRetrieval)
    .map((chunk) => `${chunk.title} (${chunk.sourceName}; ${chunk.trustLevel}; ${chunk.riskLabel}): ${summarizeText(chunk.content)}`)
    .join("\n");
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

function createRagScenario(body: Record<string, unknown>, existing?: RagScenario): RagScenario {
  const now = new Date().toISOString();
  return {
    id: existing?.id || randomUUID(),
    name: textField("Name", body.name, existing?.name, 160),
    description: textField("Description", body.description, existing?.description, 1000),
    ragRiskType: validateEnum("RAG risk type", body.ragRiskType, ragRiskTypes, existing?.ragRiskType || ragRiskTypes[0]),
    category: validateEnum("Category", body.category, categories, existing?.category || categories[0]),
    owaspMapping: validateEnum("OWASP mapping", body.owaspMapping, owaspMappings, existing?.owaspMapping || owaspMappings[0]),
    severity: validateEnum("Severity", body.severity, severities, existing?.severity || "Medium"),
    systemPrompt: requiredTextField("System prompt", body.systemPrompt, existing?.systemPrompt),
    userQuestion: requiredTextField("User question", body.userQuestion, existing?.userQuestion),
    retrievedChunks: createRetrievedChunks(body.retrievedChunks, existing?.retrievedChunks || []),
    expectedSafeBehavior: requiredTextField("Expected safe behavior", body.expectedSafeBehavior, existing?.expectedSafeBehavior),
    failureIndicators: requiredTextField("Failure indicators", body.failureIndicators, existing?.failureIndicators),
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

function createRagRun(body: Record<string, unknown>, existing?: RagRun): RagRun {
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
    ragRiskType: validateEnum("RAG risk type", body.ragRiskType, ragRiskTypes, existing?.ragRiskType || ragRiskTypes[0]),
    category: validateEnum("Category", body.category, categories, existing?.category || categories[0]),
    owaspMapping: validateEnum("OWASP mapping", body.owaspMapping, owaspMappings, existing?.owaspMapping || owaspMappings[0]),
    severity,
    systemPrompt: requiredTextField("System prompt", body.systemPrompt, existing?.systemPrompt),
    userQuestion: requiredTextField("User question", body.userQuestion, existing?.userQuestion),
    retrievedChunks: createRetrievedChunks(body.retrievedChunks, existing?.retrievedChunks || []),
    expectedSafeBehavior: requiredTextField("Expected safe behavior", body.expectedSafeBehavior, existing?.expectedSafeBehavior),
    failureIndicators: requiredTextField("Failure indicators", body.failureIndicators, existing?.failureIndicators),
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

function createSafetyCampaign(body: Record<string, unknown>, existing?: SafetyCampaign): SafetyCampaign {
  const now = new Date().toISOString();
  return {
    id: existing?.id || randomUUID(),
    name: requiredTextField("Campaign name", body.name, existing?.name, 160),
    targetSystem: requiredTextField("Target app/system", body.targetSystem, existing?.targetSystem, 160),
    modelVersion: requiredTextField("Model/app version", body.modelVersion, existing?.modelVersion, 120),
    environment: validateEnum("Environment", body.environment, safetyEnvironments, existing?.environment || "Staging"),
    objective: requiredTextField("Assessment objective", body.objective, existing?.objective, 2000),
    scope: requiredTextField("Scope", body.scope, existing?.scope, 2000),
    outOfScope: textField("Out of scope", body.outOfScope, existing?.outOfScope, 2000),
    testerName: requiredTextField("Tester name", body.testerName, existing?.testerName, 160),
    assessmentDate: String(body.assessmentDate || existing?.assessmentDate || now.slice(0, 10)),
    status: validateEnum("Campaign status", body.status, safetyCampaignStatuses, existing?.status || "Draft"),
    authorizationConfirmed: body.authorizationConfirmed === true || body.authorizationConfirmed === "true",
    notes: textField("Notes", body.notes, existing?.notes, 2000),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

function createSafetyTemplate(body: Record<string, unknown>, existing?: SafetyTemplate): SafetyTemplate {
  const now = new Date().toISOString();
  return {
    id: existing?.id || randomUUID(),
    name: requiredTextField("Template name", body.name, existing?.name, 160),
    description: textField("Description", body.description, existing?.description, 1000),
    safetyTestType: validateEnum("Safety test type", body.safetyTestType, safetyTestTypes, existing?.safetyTestType),
    category: validateEnum("Category", body.category, categories, existing?.category),
    owaspMapping: validateEnum("OWASP mapping", body.owaspMapping, owaspMappings, existing?.owaspMapping || "Custom / Other"),
    severity: validateEnum("Severity", body.severity, severities, existing?.severity),
    testPrompt: requiredTextField("Test prompt", body.testPrompt, existing?.testPrompt, 8000),
    expectedSafeBehavior: requiredTextField("Expected safe behavior", body.expectedSafeBehavior, existing?.expectedSafeBehavior, 4000),
    failureIndicators: requiredTextField("Failure indicators", body.failureIndicators, existing?.failureIndicators, 4000),
    evaluationCriteria: textField("Evaluation criteria", body.evaluationCriteria, existing?.evaluationCriteria, 4000),
    passCondition: textField("Pass condition", body.passCondition, existing?.passCondition, 2000),
    partialCondition: textField("Partial condition", body.partialCondition, existing?.partialCondition, 2000),
    failCondition: textField("Fail condition", body.failCondition, existing?.failCondition, 2000),
    recommendedMitigation: requiredTextField("Recommended mitigation", body.recommendedMitigation, existing?.recommendedMitigation, 4000),
    tags: splitTags(body.tags ?? existing?.tags ?? []),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

function createSafetyRun(body: Record<string, unknown>, existing?: SafetyRun): SafetyRun {
  const now = new Date().toISOString();
  const severity = validateEnum("Severity", body.severity, severities, existing?.severity);
  const likelihood = validateEnum("Likelihood", body.likelihood, likelihoods, existing?.likelihood || "Medium");
  const impact = validateEnum("Impact", body.impact, impacts, existing?.impact || "Medium");
  const resultStatus = validateEnum("Result status", body.resultStatus, resultStatuses, existing?.resultStatus || "Not Tested");
  const observedResponse = textField("Observed response", body.observedResponse, existing?.observedResponse, 12000);
  if (["Passed", "Failed", "Partial"].includes(resultStatus) && !observedResponse) {
    validationError("Observed response is required when marking a safety run Passed, Failed, or Partial.");
  }
  return {
    id: existing?.id || randomUUID(),
    campaignId: requiredTextField("Campaign", body.campaignId, existing?.campaignId, 160),
    projectId: String(body.projectId || existing?.projectId || ""),
    testResultId: String(body.testResultId || existing?.testResultId || ""),
    templateId: String(body.templateId || existing?.templateId || ""),
    name: requiredTextField("Test name", body.name, existing?.name, 160),
    safetyTestType: validateEnum("Safety test type", body.safetyTestType, safetyTestTypes, existing?.safetyTestType),
    category: validateEnum("Category", body.category, categories, existing?.category),
    owaspMapping: validateEnum("OWASP mapping", body.owaspMapping, owaspMappings, existing?.owaspMapping || "Custom / Other"),
    severity,
    testPrompt: requiredTextField("Test prompt", body.testPrompt, existing?.testPrompt, 8000),
    expectedSafeBehavior: requiredTextField("Expected safe behavior", body.expectedSafeBehavior, existing?.expectedSafeBehavior, 4000),
    failureIndicators: requiredTextField("Failure indicators", body.failureIndicators, existing?.failureIndicators, 4000),
    evaluationCriteria: textField("Evaluation criteria", body.evaluationCriteria, existing?.evaluationCriteria, 4000),
    observedResponse,
    resultStatus,
    likelihood,
    impact,
    riskScore: calculateFindingRiskScore(severity, likelihood, impact, resultStatus),
    evidenceNotes: textField("Evidence notes", body.evidenceNotes, existing?.evidenceNotes, 4000),
    recommendation: textField("Recommendation", body.recommendation, existing?.recommendation, 4000),
    retestStatus: validateEnum("Retest status", body.retestStatus, safetyRetestStatuses, existing?.retestStatus || "Not Retested"),
    mitigationApplied: textField("Mitigation applied", body.mitigationApplied, existing?.mitigationApplied, 4000),
    retestObservedResponse: textField("Retest observed response", body.retestObservedResponse, existing?.retestObservedResponse, 8000),
    retestNotes: textField("Retest notes", body.retestNotes, existing?.retestNotes, 4000),
    retestDate: String(body.retestDate || existing?.retestDate || ""),
    testerNotes: textField("Tester notes", body.testerNotes, existing?.testerNotes, 4000),
    dateTested: String(body.dateTested || existing?.dateTested || now.slice(0, 10)),
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

function requireKnownRagScenario(db: Awaited<ReturnType<typeof readDb>>, scenarioId: string) {
  if (!scenarioId) return;
  if (!db.ragScenarios.some((scenario) => scenario.id === scenarioId)) {
    validationError("RAG scenario not found.");
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

function resultFromRagRun(run: RagRun, projectId: string, existing?: TestResult): TestResult {
  const contextSummary = retrievedContextSummary(run.retrievedChunks);
  const contextReport = retrievedContextReport(run.retrievedChunks);
  const untrustedReport = riskyChunkReport(run.retrievedChunks);
  return createResult(
    {
      source: "RAG Attack Lab",
      ragRunId: run.id,
      ragRiskType: run.ragRiskType,
      systemPrompt: run.systemPrompt,
      retrievedContext: contextSummary,
      retrievedContextSummary: contextReport,
      untrustedChunksSummary: untrustedReport,
      userQuestion: run.userQuestion,
      evaluationCriteria: run.evaluationCriteria,
      customTestName: run.name,
      category: run.category,
      owaspMapping: run.owaspMapping,
      severity: run.severity,
      actualPrompt: [
        run.systemPrompt ? `System / intended behavior:\n${run.systemPrompt}` : "",
        `User question:\n${run.userQuestion}`,
        `Retrieved context summary:\n${contextSummary}`
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

function resultFromSafetyRun(run: SafetyRun, campaign: SafetyCampaign, projectId: string, existing?: TestResult): TestResult {
  return createResult(
    {
      source: "Jailbreak & Safety Regression Lab",
      safetyRunId: run.id,
      safetyCampaignId: campaign.id,
      campaignName: campaign.name,
      targetSystem: campaign.targetSystem,
      modelVersion: campaign.modelVersion,
      safetyTestType: run.safetyTestType,
      expectedSafeBehavior: run.expectedSafeBehavior,
      evaluationCriteria: run.evaluationCriteria,
      customTestName: run.name,
      category: run.category,
      owaspMapping: run.owaspMapping,
      severity: run.severity,
      actualPrompt: run.testPrompt,
      modelResponse: run.observedResponse,
      resultStatus: run.resultStatus,
      likelihood: run.likelihood,
      impact: run.impact,
      evidenceNotes: run.evidenceNotes,
      recommendation: run.recommendation,
      retestStatus: run.retestStatus,
      mitigationNotes: [run.mitigationApplied, run.retestNotes].filter(Boolean).join("\n\n"),
      testerNotes: run.testerNotes,
      dateTested: run.dateTested
    },
    projectId,
    existing
  );
}

function safetyCampaignSummary(campaign: SafetyCampaign, runs: SafetyRun[]) {
  const campaignRuns = runs.filter((run) => run.campaignId === campaign.id);
  const completed = campaignRuns.filter((run) => ["Passed", "Failed", "Partial"].includes(run.resultStatus));
  const passed = campaignRuns.filter((run) => run.resultStatus === "Passed").length;
  const failed = campaignRuns.filter((run) => run.resultStatus === "Failed").length;
  const partial = campaignRuns.filter((run) => run.resultStatus === "Partial").length;
  const notTested = campaignRuns.filter((run) => run.resultStatus === "Not Tested").length;
  const highCriticalFailures = campaignRuns.filter(
    (run) => run.resultStatus === "Failed" && ["High", "Critical"].includes(run.severity)
  ).length;
  const safeResults = passed + partial * 0.5;
  const refusalConsistencyScore = completed.length ? Math.round((safeResults / completed.length) * 100) : 0;
  const averageRiskScore = completed.length
    ? Math.round((completed.reduce((sum, run) => sum + run.riskScore, 0) / completed.length) * 10) / 10
    : 0;
  return {
    ...campaign,
    totalTests: campaignRuns.length,
    completedTests: completed.length,
    passed,
    failed,
    partial,
    notTested,
    highCriticalFailures,
    averageRiskScore,
    refusalConsistencyScore,
    fixed: campaignRuns.filter((run) => run.retestStatus === "Fixed").length,
    stillFailing: campaignRuns.filter((run) => run.retestStatus === "Still Failing").length,
    partiallyFixed: campaignRuns.filter((run) => run.retestStatus === "Partially Fixed").length
  };
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

async function ensureRagSeedScenarios(db: Awaited<ReturnType<typeof readDb>>) {
  if (db.ragScenarios.length > 0) return;
  db.ragScenarios = createSeedWorkbenchDb().ragScenarios;
  await writeDb(db);
}

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
      ragRunId: "",
      safetyRunId: "",
      safetyCampaignId: "",
      campaignName: "",
      targetSystem: "",
      modelVersion: "",
      safetyTestType: "",
      scenarioType: "",
      ragRiskType: "",
      systemPrompt: "",
      retrievedContext: "",
      retrievedContextSummary: "",
      untrustedChunksSummary: "",
      userQuestion: "",
      expectedSafeBehavior: test.expectedBehavior,
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
      mitigationNotes: "",
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

app.get("/api/rag/scenarios", async (_req, res) => {
  const db = await readDb();
  await ensureRagSeedScenarios(db);
  res.json(db.ragScenarios);
});

app.post("/api/rag/scenarios", async (req, res) => {
  const missing = requireFields(req.body || {}, [
    "name",
    "ragRiskType",
    "category",
    "severity",
    "systemPrompt",
    "userQuestion",
    "expectedSafeBehavior",
    "failureIndicators",
    "recommendedMitigation"
  ]);
  if (missing.length > 0) {
    res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
    return;
  }
  const db = await readDb();
  let scenario: RagScenario;
  try {
    scenario = createRagScenario(req.body || {});
  } catch (error) {
    if (handleValidation(error, res)) return;
    throw error;
  }
  db.ragScenarios.unshift(scenario);
  await writeDb(db);
  res.status(201).json(scenario);
});

app.put("/api/rag/scenarios/:id", async (req, res) => {
  const db = await readDb();
  const index = db.ragScenarios.findIndex((scenario) => scenario.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: "RAG scenario not found" });
    return;
  }
  let scenario: RagScenario;
  try {
    scenario = createRagScenario(req.body || {}, db.ragScenarios[index]);
  } catch (error) {
    if (handleValidation(error, res)) return;
    throw error;
  }
  db.ragScenarios[index] = scenario;
  await writeDb(db);
  res.json(scenario);
});

app.post("/api/rag/scenarios/:id/duplicate", async (req, res) => {
  const db = await readDb();
  const scenario = db.ragScenarios.find((item) => item.id === req.params.id);
  if (!scenario) {
    res.status(404).json({ error: "RAG scenario not found" });
    return;
  }
  const now = new Date().toISOString();
  const duplicate: RagScenario = {
    ...scenario,
    id: randomUUID(),
    name: `${scenario.name} copy`,
    retrievedChunks: scenario.retrievedChunks.map((chunk) => ({
      ...chunk,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    })),
    createdAt: now,
    updatedAt: now
  };
  db.ragScenarios.unshift(duplicate);
  await writeDb(db);
  res.status(201).json(duplicate);
});

app.delete("/api/rag/scenarios/:id", async (req, res) => {
  const db = await readDb();
  db.ragScenarios = db.ragScenarios.filter((scenario) => scenario.id !== req.params.id);
  db.ragRuns.forEach((run) => {
    if (run.scenarioId === req.params.id) run.scenarioId = "";
  });
  await writeDb(db);
  res.json({ ok: true });
});

app.post("/api/rag/scenarios/:id/test-case", async (req, res) => {
  const db = await readDb();
  const scenario = db.ragScenarios.find((item) => item.id === req.params.id);
  if (!scenario) {
    res.status(404).json({ error: "RAG scenario not found" });
    return;
  }
  let test: TestCase;
  try {
    test = createTestCase({
      name: scenario.name,
      description: scenario.description,
      category: scenario.category,
      owaspMapping: scenario.owaspMapping,
      testType: "RAG document test",
      severity: scenario.severity,
      prompt: [`User question:\n${scenario.userQuestion}`, `Retrieved context summary:\n${retrievedContextSummary(scenario.retrievedChunks)}`].join("\n\n"),
      expectedBehavior: scenario.expectedSafeBehavior,
      failureIndicators: scenario.failureIndicators,
      recommendedMitigation: scenario.recommendedMitigation,
      evaluationCriteria: scenario.evaluationCriteria,
      passCondition: scenario.passCondition,
      failCondition: scenario.failCondition,
      partialCondition: scenario.partialCondition,
      evidenceGuidance: "Record the RAG Lab run, retrieved chunks, observed AI/app response, evidence notes, and selected evaluation outcome.",
      tags: [...scenario.tags, "rag-lab", scenario.ragRiskType.toLowerCase().replaceAll(" ", "-").replaceAll("/", "")]
    });
  } catch (error) {
    if (handleValidation(error, res)) return;
    throw error;
  }
  db.testCases.unshift(test);
  await writeDb(db);
  res.status(201).json(test);
});

app.get("/api/rag/runs", async (_req, res) => {
  const db = await readDb();
  res.json(db.ragRuns);
});

app.get("/api/rag/runs/:id", async (req, res) => {
  const db = await readDb();
  const run = db.ragRuns.find((item) => item.id === req.params.id);
  if (!run) {
    res.status(404).json({ error: "RAG run not found" });
    return;
  }
  res.json(run);
});

app.post("/api/rag/runs", async (req, res) => {
  const missing = requireFields(req.body || {}, [
    "name",
    "ragRiskType",
    "category",
    "severity",
    "systemPrompt",
    "userQuestion",
    "expectedSafeBehavior",
    "failureIndicators",
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
  let run: RagRun;
  try {
    requireKnownRagScenario(db, String(req.body?.scenarioId || ""));
    run = createRagRun(req.body || {});
  } catch (error) {
    if (handleValidation(error, res)) return;
    throw error;
  }
  db.ragRuns.unshift(run);
  await writeDb(db);
  res.status(201).json(run);
});

app.put("/api/rag/runs/:id", async (req, res) => {
  const db = await readDb();
  const index = db.ragRuns.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: "RAG run not found" });
    return;
  }
  let run: RagRun;
  try {
    requireKnownRagScenario(db, String(req.body?.scenarioId || db.ragRuns[index].scenarioId || ""));
    run = createRagRun(req.body || {}, db.ragRuns[index]);
  } catch (error) {
    if (handleValidation(error, res)) return;
    throw error;
  }
  db.ragRuns[index] = run;
  await writeDb(db);
  res.json(run);
});

app.post("/api/rag/runs/:id/save-to-project", async (req, res) => {
  const db = await readDb();
  const run = db.ragRuns.find((item) => item.id === req.params.id);
  if (!run) {
    res.status(404).json({ error: "RAG run not found" });
    return;
  }
  const projectId = String(req.body?.projectId || run.projectId || "");
  const project = db.projects.find((item) => item.id === projectId);
  if (!project) {
    res.status(400).json({ error: "Select an existing project before saving this RAG run." });
    return;
  }
  let result: TestResult;
  const existingResultIndex = db.testResults.findIndex(
    (item) => item.id === run.testResultId && item.projectId === project.id
  );
  const existingResult = existingResultIndex === -1 ? undefined : db.testResults[existingResultIndex];
  try {
    result = resultFromRagRun(run, project.id, existingResult);
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

app.get("/api/safety/campaigns", async (_req, res) => {
  const db = await readDb();
  res.json(db.safetyCampaigns.map((campaign) => safetyCampaignSummary(campaign, db.safetyRuns)));
});

app.post("/api/safety/campaigns", async (req, res) => {
  const missing = requireFields(req.body || {}, ["name", "targetSystem", "modelVersion", "objective", "scope", "testerName"]);
  if (missing.length > 0) {
    res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
    return;
  }
  if (req.body?.authorizationConfirmed !== true && req.body?.authorizationConfirmed !== "true") {
    res.status(400).json({ error: "Authorization confirmation is required." });
    return;
  }
  const db = await readDb();
  let campaign: SafetyCampaign;
  try {
    campaign = createSafetyCampaign(req.body || {});
  } catch (error) {
    if (handleValidation(error, res)) return;
    throw error;
  }
  db.safetyCampaigns.unshift(campaign);
  await writeDb(db);
  res.status(201).json(campaign);
});

app.get("/api/safety/campaigns/:id", async (req, res) => {
  const db = await readDb();
  const campaign = db.safetyCampaigns.find((item) => item.id === req.params.id);
  if (!campaign) {
    res.status(404).json({ error: "Safety campaign not found" });
    return;
  }
  res.json({
    campaign: safetyCampaignSummary(campaign, db.safetyRuns),
    runs: db.safetyRuns.filter((run) => run.campaignId === campaign.id),
    templates: db.safetyTemplates
  });
});

app.put("/api/safety/campaigns/:id", async (req, res) => {
  const db = await readDb();
  const index = db.safetyCampaigns.findIndex((campaign) => campaign.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: "Safety campaign not found" });
    return;
  }
  if (req.body?.authorizationConfirmed !== true && req.body?.authorizationConfirmed !== "true") {
    res.status(400).json({ error: "Authorization confirmation is required." });
    return;
  }
  let campaign: SafetyCampaign;
  try {
    campaign = createSafetyCampaign(req.body || {}, db.safetyCampaigns[index]);
  } catch (error) {
    if (handleValidation(error, res)) return;
    throw error;
  }
  db.safetyCampaigns[index] = campaign;
  await writeDb(db);
  res.json(safetyCampaignSummary(campaign, db.safetyRuns));
});

app.get("/api/safety/templates", async (_req, res) => {
  const db = await readDb();
  res.json(db.safetyTemplates);
});

app.post("/api/safety/templates", async (req, res) => {
  const missing = requireFields(req.body || {}, [
    "name",
    "safetyTestType",
    "category",
    "severity",
    "testPrompt",
    "expectedSafeBehavior",
    "failureIndicators",
    "recommendedMitigation"
  ]);
  if (missing.length > 0) {
    res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
    return;
  }
  const db = await readDb();
  let template: SafetyTemplate;
  try {
    template = createSafetyTemplate(req.body || {});
  } catch (error) {
    if (handleValidation(error, res)) return;
    throw error;
  }
  db.safetyTemplates.unshift(template);
  await writeDb(db);
  res.status(201).json(template);
});

app.post("/api/safety/campaigns/:id/runs/from-template", async (req, res) => {
  const db = await readDb();
  const campaign = db.safetyCampaigns.find((item) => item.id === req.params.id);
  const template = db.safetyTemplates.find((item) => item.id === String(req.body?.templateId || ""));
  if (!campaign) {
    res.status(404).json({ error: "Safety campaign not found" });
    return;
  }
  if (!template) {
    res.status(404).json({ error: "Safety template not found" });
    return;
  }
  const now = new Date().toISOString();
  const run: SafetyRun = {
    id: randomUUID(),
    campaignId: campaign.id,
    projectId: "",
    testResultId: "",
    templateId: template.id,
    name: template.name,
    safetyTestType: template.safetyTestType,
    category: template.category,
    owaspMapping: template.owaspMapping,
    severity: template.severity,
    testPrompt: template.testPrompt,
    expectedSafeBehavior: template.expectedSafeBehavior,
    failureIndicators: template.failureIndicators,
    evaluationCriteria: template.evaluationCriteria,
    observedResponse: "",
    resultStatus: "Not Tested",
    likelihood: "Medium",
    impact: "Medium",
    riskScore: 0,
    evidenceNotes: "",
    recommendation: template.recommendedMitigation,
    retestStatus: "Not Retested",
    mitigationApplied: "",
    retestObservedResponse: "",
    retestNotes: "",
    retestDate: "",
    testerNotes: "",
    dateTested: now.slice(0, 10),
    createdAt: now,
    updatedAt: now
  };
  db.safetyRuns.unshift(run);
  campaign.updatedAt = now;
  await writeDb(db);
  res.status(201).json(run);
});

app.post("/api/safety/runs", async (req, res) => {
  const db = await readDb();
  if (!db.safetyCampaigns.some((campaign) => campaign.id === String(req.body?.campaignId || ""))) {
    res.status(400).json({ error: "Campaign ID must exist before saving a safety run." });
    return;
  }
  let run: SafetyRun;
  try {
    run = createSafetyRun(req.body || {});
  } catch (error) {
    if (handleValidation(error, res)) return;
    throw error;
  }
  db.safetyRuns.unshift(run);
  const campaign = db.safetyCampaigns.find((item) => item.id === run.campaignId);
  if (campaign) campaign.updatedAt = run.updatedAt;
  await writeDb(db);
  res.status(201).json(run);
});

app.put("/api/safety/runs/:id", async (req, res) => {
  const db = await readDb();
  const index = db.safetyRuns.findIndex((run) => run.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: "Safety run not found" });
    return;
  }
  if (!db.safetyCampaigns.some((campaign) => campaign.id === String(req.body?.campaignId || db.safetyRuns[index].campaignId))) {
    res.status(400).json({ error: "Campaign ID must exist before saving a safety run." });
    return;
  }
  let run: SafetyRun;
  try {
    run = createSafetyRun(req.body || {}, db.safetyRuns[index]);
  } catch (error) {
    if (handleValidation(error, res)) return;
    throw error;
  }
  db.safetyRuns[index] = run;
  const campaign = db.safetyCampaigns.find((item) => item.id === run.campaignId);
  if (campaign) campaign.updatedAt = run.updatedAt;
  await writeDb(db);
  res.json(run);
});

app.post("/api/safety/campaigns/:id/save-to-project", async (req, res) => {
  const db = await readDb();
  const campaign = db.safetyCampaigns.find((item) => item.id === req.params.id);
  const project = db.projects.find((item) => item.id === String(req.body?.projectId || ""));
  if (!campaign) {
    res.status(404).json({ error: "Safety campaign not found" });
    return;
  }
  if (!project) {
    res.status(400).json({ error: "Select an existing project before saving Safety Lab findings." });
    return;
  }
  const mode = String(req.body?.mode || "findings");
  const selectedRunIds = Array.isArray(req.body?.selectedRunIds)
    ? new Set(req.body.selectedRunIds.map((id: unknown) => String(id)))
    : new Set<string>();
  const runs = db.safetyRuns
    .filter((run) => run.campaignId === campaign.id)
    .filter((run) => selectedRunIds.size === 0 || selectedRunIds.has(run.id))
    .filter((run) =>
      mode === "completed"
        ? ["Passed", "Failed", "Partial"].includes(run.resultStatus)
        : ["Failed", "Partial"].includes(run.resultStatus)
    );
  if (runs.length === 0) {
    res.status(400).json({
      error:
        selectedRunIds.size > 0
          ? "Select at least one completed Safety Lab run to save."
          : "No Safety Lab findings are available to save for this campaign."
    });
    return;
  }
  const saved: TestResult[] = [];
  for (const run of runs) {
    const existingIndex = db.testResults.findIndex(
      (result) => result.safetyRunId === run.id && result.projectId === project.id
    );
    const existing = existingIndex === -1 ? undefined : db.testResults[existingIndex];
    const result = resultFromSafetyRun(run, campaign, project.id, existing);
    if (existingIndex === -1) db.testResults.push(result);
    else db.testResults[existingIndex] = result;
    run.projectId = project.id;
    run.testResultId = result.id;
    run.updatedAt = new Date().toISOString();
    saved.push(result);
  }
  project.updatedAt = new Date().toISOString();
  await writeDb(db);
  res.status(201).json({ saved, project: projectSummary(project, db.testResults) });
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
