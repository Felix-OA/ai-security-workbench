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
  testerNotes: string;
  dateTested: string;
  createdAt: string;
  updatedAt: string;
};

export type Db = {
  testCases: TestCase[];
  projects: Project[];
  testResults: TestResult[];
};

const dbPath = path.join(process.cwd(), "data", "db.json");

function defaultDb(): Db {
  return {
    testCases: [],
    projects: [],
    testResults: []
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
    testResults: source.testResults || []
  };
  return merged;
}

export async function writeDb(db: Db): Promise<void> {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  const json = JSON.stringify(db, null, 2);
  await fs.writeFile(dbPath, json, "utf8");
}
