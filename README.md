# AI Security Workbench

A local web app for documenting authorized LLM red team tests, scoring findings, and generating AI Risk Snapshot reports.

## Overview

**AI Security Workbench** is a defensive portfolio project for structured AI security assessments. Module 1, **Red Team Test Library + Report Generator**, helps users manage reusable LLM security tests, attach them to assessment projects, record manual results, score risk, and export a professional Markdown report. Module 2, **Prompt Injection Playground**, adds a controlled simulator for documenting authorized prompt injection scenarios and saving findings into project reports. Module 3, **RAG Attack Lab**, adds a retrieval-risk workspace for documenting trusted and untrusted context behavior in RAG systems. Module 4, **Jailbreak & Safety Regression Lab**, adds campaign-style safety-boundary testing, refusal consistency tracking, and retest documentation.

## Who It Is For

- Security learners building AI security and AI red teaming portfolio work.
- AI builders testing their own LLM apps before launch.
- Consultants preparing demo AI risk snapshots.
- Internal teams documenting authorized AI security reviews.

## Key Features

- Reusable red team test library with categories, severity, OWASP-style mapping, tags, and evaluation rubric fields.
- Assessment projects with scope, objective, system type, status, tester, and authorization confirmation.
- Test result workflow for prompt/input, observed response, status, likelihood, impact, evidence, recommendations, and retest status.
- Prompt Injection Playground with scenario templates, system prompt/intended behavior setup, user prompt input, simulated retrieved context, manual observed response capture, live risk preview, and save-to-project flow.
- RAG Attack Lab with scenario builder, retrieved context simulator, trust level and risk labels, manual observed response capture, live risk preview, and save-to-project flow.
- Jailbreak & Safety Regression Lab with safety campaign builder, reusable templates, refusal consistency score, retest workflow, live risk preview, and save-to-project flow.
- Project and portfolio dashboards with risk scores, status distribution, severity distribution, category breakdown, and top findings.
- AI Risk Snapshot report generator with rendered browser preview, copy Markdown, download Markdown, and print support.
- Seeded demo data with 15 AI security test cases, 8 prompt injection scenarios, 6 RAG Lab scenarios, 8 Safety Lab templates, a Safety Lab campaign, and a sample customer support assistant assessment.

OWASP-style mappings use 2025 GenAI/LLM Top 10-style labels for practical guidance. Review mappings against the latest OWASP GenAI Top 10 before using the output in a formal assessment.

## Module 2: Prompt Injection Playground

The Prompt Injection Playground allows users to prepare authorized prompt injection scenarios, document expected behavior, paste observed responses from the AI system being tested, evaluate outcomes, and save findings into project reports. It does not call an LLM directly.

Key features:

- System prompt / intended behavior setup.
- User prompt input.
- Simulated retrieved document, tool output, or context.
- Scenario templates for direct override, RAG context injection, tool output injection, role confusion, leakage attempts, and output handling probes.
- Manual observed response capture from the tested AI system.
- Pass/fail/partial evaluation.
- Risk score preview.
- Save run to project.
- Save scenario as reusable test case.
- Report generator integration with `Source: Prompt Injection Playground`.

## Module 3: RAG Attack Lab

The RAG Attack Lab allows users to simulate retrieval-based AI risks, document trusted and untrusted context, evaluate observed assistant behavior, and save RAG findings into project reports.

Key features:

- RAG scenario builder.
- Retrieved context simulator.
- Trust level and risk labels.
- Expected behavior rubric.
- Manual observed response capture.
- Pass/fail/partial evaluation.
- Risk score preview.
- Save to project.
- Save scenario as reusable test case.
- Report generator integration with `Source: RAG Attack Lab`.

## Module 4: Jailbreak & Safety Regression Lab

The Jailbreak & Safety Regression Lab helps document authorized safety-boundary testing, refusal consistency, jailbreak resistance, retesting after mitigations, and safety regression findings.

Key features:

- Safety campaign builder.
- Reusable safety test templates.
- Refusal boundary testing.
- Instruction hierarchy testing.
- System prompt leakage attempts.
- Multi-turn escalation documentation.
- Retest workflow.
- Refusal consistency score.
- Save to project.
- Report generator integration with `Source: Jailbreak & Safety Regression Lab`.

## Demo Workflow

1. Open the dashboard.
2. Review the seeded sample project.
3. Open the test library and filter to `Prompt Injection` or `High` severity.
4. Open a test case and review its expected behavior, failure indicators, and evaluation rubric.
5. Use the test in an existing project.
6. Add multiple tests from the library with filters and select-all-visible.
7. Edit a failed result and review the calculated risk score.
8. Open the Prompt Injection Playground and load a seeded scenario.
9. Paste an observed AI/app response, evaluate the outcome, and save the run to the sample project.
10. Open the RAG Attack Lab and load `Malicious Warranty Document Instruction`.
11. Review trusted and untrusted retrieved chunks, paste an observed AI/app response, evaluate the outcome, and save the run to the sample project.
12. Open the Safety Lab and load the demo safety campaign.
13. Review seeded refusal-boundary tests, paste an observed response, evaluate the outcome, and save Safety Lab findings to the sample project.
14. Open the project dashboard.
15. Generate the AI Risk Snapshot report.
16. Copy or download the Markdown report.

## Tech Stack

- Node.js
- Express
- TypeScript
- Vanilla HTML/CSS/JavaScript frontend
- Local JSON persistence in `data/db.json`
- Node test runner for scoring, seed data, reports, Playground, RAG Lab, and Safety Lab save flows

This v1 intentionally keeps the current lightweight architecture. A future version can migrate to Next.js, Prisma, SQLite, and a component framework after the product workflow is stable.

## Local Setup

```bash
npm install
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

## Seed Data

Reset local demo data:

```bash
npm run db:seed
```

The seed creates:

- 15 reusable AI red team test cases.
- 8 prompt injection playground scenarios.
- 6 RAG Attack Lab scenarios.
- 8 Safety Lab templates.
- 1 Safety Lab demo campaign with mixed passed, failed, partial, and not-tested runs.
- 1 demo project: `Demo Assessment - Customer Support AI Assistant`.
- Attached project results with Test Library, Playground, RAG Lab, and Safety Lab sources.

The in-app **Reset Demo Data** action is intended for local demos. It is disabled in production unless `ALLOW_DEMO_RESET=true` is explicitly set.

## Scoring Methodology

Individual finding score:

```text
severityWeight * likelihoodWeight * impactWeight * resultStatusMultiplier
```

Severity weights:

- Info: 0
- Low: 2
- Medium: 4
- High: 7
- Critical: 10

Likelihood and impact weights:

- Low: 1
- Medium: 1.25
- High: 1.5

Result status multipliers:

- Passed: 0
- Not Applicable: 0
- Not Tested: 0
- Partial: 0.5
- Failed: 1

Project risk score is normalized to 0-100 using only `Passed`, `Failed`, and `Partial` results in the denominator. `Not Tested` and `Not Applicable` are excluded.

A low score does not guarantee the AI system is secure. It only reflects the tests documented in the assessment.

## Ethical Use Notice

This tool is intended only for authorized AI security testing, internal assessments, demos, and educational use. Do not use it to test systems you do not own or have explicit permission to assess.

Use this tool only on systems you own or have explicit permission to test.

## Current Limitations

- Local single-user app; no authentication or multi-user workspaces.
- JSON file persistence; no database migrations yet.
- Manual test execution only; no live model scanning or automated offensive testing.
- Markdown and print-friendly report export only; no PDF generation yet.
- Evidence URL field is text-only; no file upload workflow yet.

## Screenshots

### Module 1: Red Team Test Library + Report Generator

#### Landing Page
![Landing Page](docs/screenshots/landing-page.png)

#### Dashboard
![Dashboard](docs/screenshots/dashboard.png)

#### Test Library
![Test Library](docs/screenshots/test-library.png)

#### Project Dashboard
![Project Dashboard](docs/screenshots/project-dashboard.png)

#### Report Generator
![Report Generator](docs/screenshots/report-generator.png)

### Module 2: Prompt Injection Playground

#### Playground Main Screen with Authorization Notice
![Playground Main Screen with Authorization Notice](docs/screenshots/module-2/01-playground-main-auth-notice.png)

#### Loaded Malicious Retrieved Document Scenario
![Loaded Malicious Retrieved Document Scenario](docs/screenshots/module-2/02-loaded-malicious-retrieved-document-scenario.png)

#### Failed Evaluation with Live Risk Score
![Failed Evaluation with Live Risk Score](docs/screenshots/module-2/03-failed-evaluation-risk-score.png)

#### Project Result Showing Source: Playground
![Project Result Showing Source Playground](docs/screenshots/module-2/04-project-result-source-playground.png)

#### Report Preview Showing Source: Prompt Injection Playground
![Report Preview Showing Source Prompt Injection Playground](docs/screenshots/module-2/05-report-source-prompt-injection-playground.png)

### Module 3: RAG Attack Lab

#### RAG Lab Main Screen with Manual-Only Notice
![RAG Lab Main Screen with Manual-Only Notice](docs/screenshots/module-3/01-rag-lab-main-manual-notice.png)

#### Malicious Warranty Document Scenario
![Malicious Warranty Document Scenario](docs/screenshots/module-3/02-malicious-warranty-document-scenario.png)

#### Retrieved Context with Trusted and Untrusted Chunks
![Retrieved Context with Trusted and Untrusted Chunks](docs/screenshots/module-3/03-retrieved-context-trusted-untrusted-chunks.png)

#### Failed RAG Evaluation with Live Risk Score
![Failed RAG Evaluation with Live Risk Score](docs/screenshots/module-3/04-rag-failed-evaluation-risk-score.png)

#### Project Result Showing Source: RAG Attack Lab
![Project Result Showing Source RAG Attack Lab](docs/screenshots/module-3/05-project-result-source-rag-attack-lab.png)

#### Report Preview Showing RAG Finding and Retrieved Context
![Report Preview Showing RAG Finding and Retrieved Context](docs/screenshots/module-3/06-report-rag-finding-retrieved-context.png)

## Quality Checks

```bash
npm test
npm run typecheck
```

## Roadmap

- SQLite/Prisma persistence layer.
- Polished React/Next.js frontend.
- PDF export.
- Evidence attachment workflow.
- Test library versioning.
- Optional model API integration for authorized local evaluations.
- RAG Attack Lab Module 3.1 polish: richer citations, chunk import/export, and retrieval relevance scoring.
- Safety Lab Module 4.1 polish: richer campaign comparison, import/export, and version-to-version regression charts.
- AI Security Dashboard improvements.
- Multi-user workspaces.
