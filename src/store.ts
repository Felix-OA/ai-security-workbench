import { promises as fs } from "node:fs";
import path from "node:path";

export type TestCase = {
  id: string;
  name: string;
  description: string;
  category: string;
  owaspMapping: string;
  testType: string;
  severity: string;
  prompt: string;
  expectedBehavior: string;
  failureIndicators: string;
  recommendedMitigation: string;
  evaluationCriteria: string;
  passCondition: string;
  failCondition: string;
  partialCondition: string;
  evidenceGuidance: string;
  tags: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  name: string;
  clientName: string;
  industry: string;
  aiSystemType: string;
  objective: string;
  scope: string;
  outOfScope: string;
  testerName: string;
  assessmentDate: string;
  status: string;
  authorizationConfirmed: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type TestResult = {
  id: string;
  projectId: string;
  testCaseId: string;
  source: "Test Library" | "Prompt Injection Playground" | "RAG Attack Lab" | "Jailbreak & Safety Regression Lab" | "Custom";
  playgroundRunId: string;
  ragRunId: string;
  safetyRunId: string;
  safetyCampaignId: string;
  campaignName: string;
  targetSystem: string;
  modelVersion: string;
  safetyTestType: string;
  scenarioType: string;
  ragRiskType: string;
  systemPrompt: string;
  retrievedContext: string;
  retrievedContextSummary: string;
  untrustedChunksSummary: string;
  userQuestion: string;
  expectedSafeBehavior: string;
  evaluationCriteria: string;
  customTestName: string;
  category: string;
  owaspMapping: string;
  severity: string;
  actualPrompt: string;
  modelResponse: string;
  resultStatus: string;
  likelihood: string;
  impact: string;
  riskScore: number;
  evidenceNotes: string;
  evidenceUrl: string;
  recommendation: string;
  retestStatus: string;
  mitigationNotes: string;
  testerNotes: string;
  dateTested: string;
  createdAt: string;
  updatedAt: string;
};

export type PromptInjectionScenario = {
  id: string;
  name: string;
  description: string;
  scenarioType: string;
  category: string;
  owaspMapping: string;
  severity: string;
  systemPrompt: string;
  userPrompt: string;
  retrievedContext: string;
  expectedSafeBehavior: string;
  failureIndicators: string;
  evaluationCriteria: string;
  passCondition: string;
  partialCondition: string;
  failCondition: string;
  recommendedMitigation: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type PlaygroundRun = {
  id: string;
  scenarioId: string;
  projectId: string;
  testResultId: string;
  name: string;
  scenarioType: string;
  category: string;
  owaspMapping: string;
  severity: string;
  systemPrompt: string;
  userPrompt: string;
  retrievedContext: string;
  expectedSafeBehavior: string;
  failureIndicators: string;
  evaluationCriteria: string;
  actualResponse: string;
  resultStatus: string;
  likelihood: string;
  impact: string;
  riskScore: number;
  evidenceNotes: string;
  recommendation: string;
  testerNotes: string;
  createdAt: string;
  updatedAt: string;
};

export type RetrievedChunk = {
  id: string;
  title: string;
  sourceName: string;
  sourceType: string;
  trustLevel: string;
  riskLabel: string;
  content: string;
  includeInRetrieval: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RagScenario = {
  id: string;
  name: string;
  description: string;
  ragRiskType: string;
  category: string;
  owaspMapping: string;
  severity: string;
  systemPrompt: string;
  userQuestion: string;
  retrievedChunks: RetrievedChunk[];
  expectedSafeBehavior: string;
  failureIndicators: string;
  evaluationCriteria: string;
  passCondition: string;
  partialCondition: string;
  failCondition: string;
  recommendedMitigation: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type RagRun = {
  id: string;
  scenarioId: string;
  projectId: string;
  testResultId: string;
  name: string;
  ragRiskType: string;
  category: string;
  owaspMapping: string;
  severity: string;
  systemPrompt: string;
  userQuestion: string;
  retrievedChunks: RetrievedChunk[];
  expectedSafeBehavior: string;
  failureIndicators: string;
  evaluationCriteria: string;
  actualResponse: string;
  resultStatus: string;
  likelihood: string;
  impact: string;
  riskScore: number;
  evidenceNotes: string;
  recommendation: string;
  testerNotes: string;
  createdAt: string;
  updatedAt: string;
};

export type SafetyCampaign = {
  id: string;
  name: string;
  targetSystem: string;
  modelVersion: string;
  environment: string;
  objective: string;
  scope: string;
  outOfScope: string;
  testerName: string;
  assessmentDate: string;
  status: string;
  authorizationConfirmed: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type SafetyTemplate = {
  id: string;
  name: string;
  description: string;
  safetyTestType: string;
  category: string;
  owaspMapping: string;
  severity: string;
  testPrompt: string;
  expectedSafeBehavior: string;
  failureIndicators: string;
  evaluationCriteria: string;
  passCondition: string;
  partialCondition: string;
  failCondition: string;
  recommendedMitigation: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type SafetyRun = {
  id: string;
  campaignId: string;
  projectId: string;
  testResultId: string;
  templateId: string;
  name: string;
  safetyTestType: string;
  category: string;
  owaspMapping: string;
  severity: string;
  testPrompt: string;
  expectedSafeBehavior: string;
  failureIndicators: string;
  evaluationCriteria: string;
  observedResponse: string;
  resultStatus: string;
  likelihood: string;
  impact: string;
  riskScore: number;
  evidenceNotes: string;
  recommendation: string;
  retestStatus: string;
  mitigationApplied: string;
  retestObservedResponse: string;
  retestNotes: string;
  retestDate: string;
  testerNotes: string;
  dateTested: string;
  createdAt: string;
  updatedAt: string;
};

export type Db = {
  testCases: TestCase[];
  projects: Project[];
  testResults: TestResult[];
  promptInjectionScenarios: PromptInjectionScenario[];
  playgroundRuns: PlaygroundRun[];
  ragScenarios: RagScenario[];
  ragRuns: RagRun[];
  safetyCampaigns: SafetyCampaign[];
  safetyTemplates: SafetyTemplate[];
  safetyRuns: SafetyRun[];
};

const dbPath = path.join(process.cwd(), "data", "db.json");

function defaultDb(): Db {
  return {
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
}

export async function readDb(): Promise<Db> {
  let raw = "";
  try {
    raw = await fs.readFile(dbPath, "utf8");
  } catch (error) {
    return defaultDb();
  }
  const parsed = JSON.parse(raw) as Partial<Db> & { workbench?: Partial<Db> };
  const source = parsed.workbench || parsed;
  const merged: Db = {
    testCases: source.testCases || [],
    projects: source.projects || [],
    testResults: (source.testResults || []).map((result) => ({
      ...result,
      source: result.source || "Test Library",
      playgroundRunId: result.playgroundRunId || "",
      ragRunId: result.ragRunId || "",
      safetyRunId: result.safetyRunId || "",
      safetyCampaignId: result.safetyCampaignId || "",
      campaignName: result.campaignName || "",
      targetSystem: result.targetSystem || "",
      modelVersion: result.modelVersion || "",
      safetyTestType: result.safetyTestType || "",
      scenarioType: result.scenarioType || "",
      ragRiskType: result.ragRiskType || "",
      systemPrompt: result.systemPrompt || "",
      retrievedContext: result.retrievedContext || "",
      retrievedContextSummary: result.retrievedContextSummary || "",
      untrustedChunksSummary: result.untrustedChunksSummary || "",
      userQuestion: result.userQuestion || "",
      expectedSafeBehavior: result.expectedSafeBehavior || "",
      evaluationCriteria: result.evaluationCriteria || "",
      mitigationNotes: result.mitigationNotes || ""
    })) as TestResult[],
    promptInjectionScenarios: source.promptInjectionScenarios || [],
    playgroundRuns: source.playgroundRuns || [],
    ragScenarios: source.ragScenarios || [],
    ragRuns: source.ragRuns || [],
    safetyCampaigns: source.safetyCampaigns || [],
    safetyTemplates: source.safetyTemplates || [],
    safetyRuns: source.safetyRuns || []
  };
  return merged;
}

export async function writeDb(db: Db): Promise<void> {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  const json = JSON.stringify(db, null, 2);
  await fs.writeFile(dbPath, json, "utf8");
}
