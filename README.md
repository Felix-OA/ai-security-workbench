# AI Security Workbench

A local web app for documenting authorized LLM red team tests, scoring findings, and generating AI Risk Snapshot reports.

## Overview

**AI Security Workbench v1** is a defensive portfolio project for structured AI security assessments. The first module, **Red Team Test Library + Report Generator**, helps users manage reusable LLM security tests, attach them to assessment projects, record manual results, score risk, and export a professional Markdown report.

## Who It Is For

- Security learners building AI security and AI red teaming portfolio work.
- AI builders testing their own LLM apps before launch.
- Consultants preparing demo AI risk snapshots.
- Internal teams documenting authorized AI security reviews.

## Key Features

- Reusable red team test library with categories, severity, OWASP-style mapping, tags, and evaluation rubric fields.
- Assessment projects with scope, objective, system type, status, tester, and authorization confirmation.
- Test result workflow for prompt/input, observed response, status, likelihood, impact, evidence, recommendations, and retest status.
- Project and portfolio dashboards with risk scores, status distribution, severity distribution, category breakdown, and top findings.
- AI Risk Snapshot report generator with rendered browser preview, copy Markdown, download Markdown, and print support.
- Seeded demo data with 15 AI security test cases and a sample customer support assistant assessment.

## Demo Workflow

1. Open the dashboard.
2. Review the seeded sample project.
3. Open the test library and filter to `Prompt Injection` or `High` severity.
4. Open a test case and review its expected behavior, failure indicators, and evaluation rubric.
5. Use the test in an existing project.
6. Add multiple tests from the library with filters and select-all-visible.
7. Edit a failed result and review the calculated risk score.
8. Open the project dashboard.
9. Generate the AI Risk Snapshot report.
10. Copy or download the Markdown report.

## Tech Stack

- Node.js
- Express
- TypeScript
- Vanilla HTML/CSS/JavaScript frontend
- Local JSON persistence in `data/db.json`
- Node test runner for scoring logic

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
- 1 demo project: `Demo Assessment - Customer Support AI Assistant`.
- 8 attached test results with passed, failed, and partial outcomes.

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

Screenshots will be added after the final local demo pass. Recommended captures:

- `/dashboard`
- `/tests?category=Prompt%20Injection`
- `/projects/sample-project`
- `/projects/sample-project/dashboard`
- `/projects/sample-project/report`

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
- Prompt Injection Playground.
- RAG Attack Lab.
- Multi-user workspaces.
