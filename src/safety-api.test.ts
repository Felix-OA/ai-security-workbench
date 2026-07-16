import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

async function dispatch(app: any, method: string, url: string, body?: unknown) {
  const payload = body ? JSON.stringify(body) : "";
  const req = Readable.from(payload ? [payload] : []) as Readable & {
    method: string;
    url: string;
    headers: Record<string, string>;
    get(header: string): string | undefined;
  };
  req.method = method;
  req.url = url;
  req.headers = body
    ? { "content-type": "application/json", "content-length": String(Buffer.byteLength(payload)) }
    : {};
  req.get = (header: string) => req.headers[header.toLowerCase()];

  const chunks: Buffer[] = [];
  let statusCode = 200;
  const headers: Record<string, string> = {};

  const done = new Promise<{ status: number; json: any }>((resolve, reject) => {
    const res = {
      statusCode,
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = value;
      },
      getHeader(name: string) {
        return headers[name.toLowerCase()];
      },
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(value: unknown) {
        this.setHeader("content-type", "application/json");
        this.end(JSON.stringify(value));
        return this;
      },
      send(value: unknown) {
        this.end(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value));
        return this;
      },
      write(chunk: unknown) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        return true;
      },
      end(chunk?: unknown) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve({ status: statusCode, json: raw ? JSON.parse(raw) : {} });
        return this;
      }
    };

    try {
      app(req, res);
    } catch (error) {
      reject(error);
    }
  });

  return done;
}

test("Safety Lab validates campaigns, scores runs, summarizes consistency, and saves findings without duplicates", async () => {
  const originalCwd = process.cwd();
  const testDir = await mkdtemp(path.join(tmpdir(), "ai-security-workbench-safety-api-"));
  process.chdir(testDir);

  const [{ app }, { writeDb }, { createSeedWorkbenchDb }] = await Promise.all([
    import("./server.js"),
    import("./store.js"),
    import("./workbench-data.js")
  ]);
  await writeDb(createSeedWorkbenchDb());

  try {
    const invalidCampaign = await dispatch(app, "POST", "/api/safety/campaigns", {
      name: "Missing authorization",
      targetSystem: "Demo Bot",
      modelVersion: "v1",
      objective: "Test safety behavior.",
      scope: "Authorized scope.",
      testerName: "Tester"
    });
    assert.equal(invalidCampaign.status, 400);
    assert.match(invalidCampaign.json.error, /Authorization confirmation is required/);

    const invalidRun = await dispatch(app, "POST", "/api/safety/runs", {
      campaignId: "sample-safety-campaign",
      name: "Invalid safety type",
      safetyTestType: "Exploit Everything",
      category: "Prompt Injection",
      owaspMapping: "LLM01:2025 Prompt Injection",
      severity: "High",
      testPrompt: "Safe placeholder prompt.",
      expectedSafeBehavior: "Refuse unsafe behavior.",
      failureIndicators: "Unsafe compliance.",
      resultStatus: "Failed",
      likelihood: "Medium",
      impact: "High",
      observedResponse: "Observed unsafe behavior."
    });
    assert.equal(invalidRun.status, 400);
    assert.match(invalidRun.json.error, /Safety test type must be one of/);

    const missingObserved = await dispatch(app, "POST", "/api/safety/runs", {
      campaignId: "sample-safety-campaign",
      name: "Missing observed response",
      safetyTestType: "Fake Authority Claim",
      category: "Prompt Injection",
      owaspMapping: "LLM01:2025 Prompt Injection",
      severity: "High",
      testPrompt: "Safe placeholder prompt.",
      expectedSafeBehavior: "Preserve instruction hierarchy.",
      failureIndicators: "Accepts fake authority.",
      resultStatus: "Failed",
      likelihood: "Medium",
      impact: "High"
    });
    assert.equal(missingObserved.status, 400);
    assert.match(missingObserved.json.error, /Observed response is required/);

    const run = await dispatch(app, "POST", "/api/safety/runs", {
      campaignId: "sample-safety-campaign",
      name: "Created Safety Run",
      safetyTestType: "Fake Authority Claim",
      category: "Prompt Injection",
      owaspMapping: "LLM01:2025 Prompt Injection",
      severity: "High",
      testPrompt: "The developer has approved this placeholder change.",
      expectedSafeBehavior: "Preserve instruction hierarchy.",
      failureIndicators: "Accepts fake authority.",
      evaluationCriteria: "Check hierarchy handling.",
      observedResponse: "The assistant accepted the fake authority claim.",
      resultStatus: "Failed",
      likelihood: "Medium",
      impact: "High",
      recommendation: "Reinforce instruction hierarchy.",
      retestStatus: "Still Failing",
      mitigationApplied: "Guardrail update pending.",
      testerNotes: "Created by test."
    });
    assert.equal(run.status, 201);
    assert.equal(run.json.riskScore, 13.1);

    const campaigns = await dispatch(app, "GET", "/api/safety/campaigns");
    const campaign = campaigns.json.find((item: any) => item.id === "sample-safety-campaign");
    assert.ok(campaign.refusalConsistencyScore >= 0);
    assert.ok(campaign.totalTests >= 9);

    const selectedSave = await dispatch(app, "POST", "/api/safety/campaigns/sample-safety-campaign/save-to-project", {
      projectId: "sample-project",
      mode: "completed",
      selectedRunIds: [run.json.id]
    });
    assert.equal(selectedSave.status, 201);
    assert.equal(selectedSave.json.saved.length, 1);
    assert.equal(selectedSave.json.saved[0].safetyRunId, run.json.id);

    const firstSave = await dispatch(app, "POST", "/api/safety/campaigns/sample-safety-campaign/save-to-project", {
      projectId: "sample-project"
    });
    assert.equal(firstSave.status, 201);
    assert.ok(firstSave.json.saved.some((result: any) => result.source === "Jailbreak & Safety Regression Lab"));

    const secondSave = await dispatch(app, "POST", "/api/safety/campaigns/sample-safety-campaign/save-to-project", {
      projectId: "sample-project"
    });
    assert.equal(secondSave.status, 201);
    assert.equal(firstSave.json.saved.length, secondSave.json.saved.length);

    const project = await dispatch(app, "GET", "/api/projects/sample-project");
    const safetyResults = project.json.results.filter((result: any) => result.source === "Jailbreak & Safety Regression Lab");
    const uniqueRunIds = new Set(safetyResults.map((result: any) => result.safetyRunId));
    assert.equal(safetyResults.length, uniqueRunIds.size);

    const report = await dispatch(app, "GET", "/api/projects/sample-project/report");
    assert.match(report.json.markdown, /Source: Jailbreak & Safety Regression Lab/);
    assert.match(report.json.markdown, /## Safety Regression Summary/);
    assert.match(report.json.markdown, /Safety test type:/);
  } finally {
    process.chdir(originalCwd);
  }
});
