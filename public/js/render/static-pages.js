import { app } from "../dom.js";
import { state } from "../state.js";
import { setTitle, setActions } from "../layout.js";
import { escapeHtml } from "../utils.js";
import { badge } from "../components/badges.js";
import { stat, countsBy, chart } from "../components/cards.js";
import { table } from "../components/tables.js";

export function renderLanding() {
  setTitle("AI Security Workbench", "Structured AI red team testing for authorized LLM app assessments.");
  setActions([
    `<button onclick="go('/dashboard')">Open Dashboard</button>`,
    `<button class="secondary" onclick="go('/sample-report')">View Sample Report</button>`
  ]);
  app.innerHTML = `
    <section class="hero">
      <div>
        <p class="eyebrow">AI Security Workbench</p>
        <h2>Structured AI red team testing for authorized LLM app assessments.</h2>
        <p>Build reusable AI red team tests, run scoped assessments, score findings, and generate Markdown AI Risk Snapshot reports for demos, internal reviews, and client-ready documentation.</p>
      </div>
      <div class="actions">
        <button onclick="go('/dashboard')">Open Dashboard</button>
        <button class="secondary" onclick="go('/sample-report')">View Sample Report</button>
      </div>
      <div class="notice">For authorized testing only. Use this tool only on systems you own or have explicit permission to test.</div>
      <div class="grid">
        ${["Red Team Test Library", "Prompt Injection Playground", "RAG Attack Lab", "Jailbreak & Safety Regression Lab", "Report Generator"]
          .map(
            (title) => `<article class="card module-card span-3"><h3>${title}</h3><p>${moduleCopy(title)}</p></article>`
          )
          .join("")}
      </div>
    </section>`;
}

function moduleCopy(title) {
  return {
    "Red Team Test Library": "Reusable, categorized LLM security tests mapped to common AI risk categories.",
    "Prompt Injection Playground": "Manual prompt injection scenario builder for observed-response evaluation.",
    "RAG Attack Lab": "Retrieved context simulator for document injection, source confusion, privacy, and grounding risks.",
    "Jailbreak & Safety Regression Lab": "Campaign-style refusal boundary testing, retest tracking, and safety regression documentation.",
    "Report Generator": "Copy, download, or print structured AI Risk Snapshot reports."
  }[title];
}

export function renderDashboard() {
  setTitle("Dashboard");
  setActions([
    `<button onclick="go('/projects/new')">New Project</button>`,
    `<button class="secondary" onclick="go('/tests/new')">Add Test Case</button>`,
    `<button class="secondary" onclick="go('/projects/sample-project')">Open Sample Project</button>`
  ]);
  const totalFindings = state.testResults.filter((result) => ["Failed", "Partial"].includes(result.resultStatus)).length;
  const avgRisk = state.projects.length
    ? Math.round(state.projects.reduce((sum, project) => sum + project.riskScore, 0) / state.projects.length)
    : 0;
  const recentRows = state.projects.slice(0, 5).map((project) => `<tr>
    <td><span class="row-title"><strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(project.clientName)}</small></span></td>
    <td>${badge(project.status, "neutral")}</td>
    <td>${badge(project.riskLevel, project.riskLevel)}</td>
    <td>${project.riskScore}</td>
    <td><button class="secondary" onclick="go('/projects/${project.id}')">Open</button></td>
  </tr>`);
  app.innerHTML = `
    <section class="section">
      <div class="notice">A low score does not guarantee the AI system is secure. It only reflects the tests documented in each assessment.</div>
      <div class="grid">
        <div class="span-3">${stat("Total projects", state.projects.length)}</div>
        <div class="span-3">${stat("Total test cases", state.testCases.length)}</div>
        <div class="span-3">${stat("Total findings", totalFindings, "Failed and partial")}</div>
        <div class="span-3">${stat("Average risk score", avgRisk)}</div>
      </div>
    </section>
    <section class="grid">
      <div class="section span-7">
        <div class="section-head"><div><h2>Recent projects</h2><p>Open an assessment workspace or report.</p></div></div>
        ${table(["Project", "Status", "Risk", "Score", "Actions"], recentRows, "No projects yet.")}
      </div>
      <div class="section span-5">
        <div class="section-head"><div><h2>Top risk categories</h2><p>Across all documented results.</p></div></div>
        <div class="card">${chart(countsBy(state.testResults.filter((r) => ["Failed", "Partial"].includes(r.resultStatus)), "category"))}</div>
      </div>
    </section>`;
}

export function renderAbout() {
  setTitle("About");
  setActions([]);
  app.innerHTML = `
    <section class="section">
      <article class="card">
        <h2>AI Security Workbench</h2>
        <p>AI Security Workbench helps security learners, AI builders, consultants, and internal teams document authorized LLM application assessments. The first module focuses on reusable red team test cases, manual result logging, risk scoring, dashboards, and Markdown reports.</p>
        <div class="notice">This tool is intended only for authorized AI security testing, internal assessments, demos, and educational use. Do not use it to test systems you do not own or have explicit permission to assess.</div>
      </article>
    </section>`;
}

export function renderNotFound(message = "Page not found.") {
  setTitle("Not Found");
  setActions([`<button onclick="go('/dashboard')">Open Dashboard</button>`]);
  app.innerHTML = `<div class="empty"><strong>${escapeHtml(message)}</strong><span>Use the sidebar to continue.</span></div>`;
}
