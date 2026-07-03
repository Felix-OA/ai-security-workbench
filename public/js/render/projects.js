import { app } from "../dom.js";
import { fetchJson } from "../api.js";
import { state, loadState } from "../state.js";
import { setTitle, setActions } from "../layout.js";
import { go, routeQuery } from "../navigation.js";
import { projectRiskScore, riskLevel } from "../scoring.js";
import { escapeHtml, rowsFromForm } from "../utils.js";
import { badge } from "../components/badges.js";
import { optionList, errorBox } from "../components/forms.js";
import { table } from "../components/tables.js";
import { stat, countsBy, chart, riskMeter } from "../components/cards.js";
import { testName } from "../names.js";

export function renderProjects() {
  setTitle("Projects");
  setActions([`<button onclick="go('/projects/new')">New Project</button>`]);
  const search = routeQuery();
  const status = search.get("status") || "";
  const industry = search.get("industry") || "";
  const risk = search.get("risk") || "";
  const industries = [...new Set(state.projects.map((project) => project.industry))].filter(Boolean);
  const filtered = state.projects.filter((project) => (!status || project.status === status) && (!industry || project.industry === industry) && (!risk || project.riskLevel === risk));
  const rows = filtered.map((project) => `<tr>
    <td><span class="row-title"><strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(project.clientName)}</small></span></td>
    <td>${escapeHtml(project.aiSystemType)}</td>
    <td>${escapeHtml(project.industry)}</td>
    <td>${badge(project.status, "neutral")}</td>
    <td>${badge(project.riskLevel, project.riskLevel)} ${project.riskScore}</td>
    <td>${project.testCount}</td>
    <td>${project.failedCount}</td>
    <td>${new Date(project.updatedAt).toLocaleDateString()}</td>
    <td class="actions"><button class="secondary" onclick="go('/projects/${project.id}')">Open</button><button class="secondary" onclick="go('/projects/${project.id}/edit')">Edit</button></td>
  </tr>`);
  app.innerHTML = `
    <section class="section">
      <div class="filters">
        <input disabled value="Assessment projects" />
        <select id="project-status"><option value="">All statuses</option>${optionList(state.constants.projectStatuses, status)}</select>
        <select id="project-industry"><option value="">All industries</option>${optionList(industries, industry)}</select>
        <select id="project-risk"><option value="">All risk levels</option>${optionList(["Low", "Medium", "High", "Critical"], risk)}</select>
      </div>
      ${table(["Project name", "AI system type", "Industry", "Status", "Risk score", "Tests", "Failed", "Updated", "Actions"], rows, "No projects yet.")}
    </section>`;
  ["project-status", "project-industry", "project-risk"].forEach((id) => document.getElementById(id).addEventListener("input", updateProjectFilters));
}

export function updateProjectFilters() {
  const params = new URLSearchParams();
  const status = document.getElementById("project-status").value;
  const industry = document.getElementById("project-industry").value;
  const risk = document.getElementById("project-risk").value;
  if (status) params.set("status", status);
  if (industry) params.set("industry", industry);
  if (risk) params.set("risk", risk);
  history.replaceState(null, "", `#/projects${params.toString() ? `?${params}` : ""}`);
  renderProjects();
}

export function renderProjectForm(id = "") {
  const project = id ? state.projects.find((item) => item.id === id) : null;
  setTitle(project ? "Edit Project" : "New Project");
  setActions([`<button class="secondary" onclick="go('/projects')">Back to Projects</button>`]);
  app.innerHTML = `
    <form class="form-panel" id="project-form">
      <div id="form-error"></div>
      <div class="form-grid">
        <label>Project name<input name="name" required value="${escapeHtml(project?.name)}" /></label>
        <label>Client/app name<input name="clientName" required value="${escapeHtml(project?.clientName)}" /></label>
        <label>Industry<input name="industry" required value="${escapeHtml(project?.industry)}" /></label>
        <label>AI system type<select name="aiSystemType">${optionList(state.constants.aiSystemTypes, project?.aiSystemType || state.constants.aiSystemTypes[0])}</select></label>
        <label class="field-wide">Assessment objective<textarea name="objective" required>${escapeHtml(project?.objective)}</textarea></label>
        <label class="field-wide">Scope<textarea name="scope" required>${escapeHtml(project?.scope)}</textarea></label>
        <label class="field-wide">Out-of-scope<textarea name="outOfScope">${escapeHtml(project?.outOfScope)}</textarea></label>
        <label>Tester name<input name="testerName" required value="${escapeHtml(project?.testerName)}" /></label>
        <label>Assessment date<input name="assessmentDate" type="date" value="${escapeHtml(project?.assessmentDate || new Date().toISOString().slice(0, 10))}" /></label>
        <label>Status<select name="status">${optionList(state.constants.projectStatuses, project?.status || "Draft")}</select></label>
        <label>Notes<input name="notes" value="${escapeHtml(project?.notes)}" /></label>
        <label class="check field-wide"><input type="checkbox" name="authorizationConfirmed" ${project?.authorizationConfirmed ? "checked" : ""} required /> I confirm this assessment is authorized.</label>
      </div>
      <div class="actions"><button type="submit">${project ? "Save Project" : "Create Project"}</button></div>
    </form>`;
  document.getElementById("project-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = rowsFromForm(event.currentTarget);
      const saved = await fetchJson(project ? `/api/projects/${project.id}` : "/api/projects", {
        method: project ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
      showToast("Project saved");
      await loadState();
      go(`/projects/${saved.id}`);
    } catch (error) {
      document.getElementById("form-error").innerHTML = errorBox(error);
    }
  });
}

export async function getProject(id) {
  return fetchJson(`/api/projects/${id}`);
}

export async function renderProjectDetail(id) {
  const data = await getProject(id);
  const project = data.project;
  const results = data.results;
  setTitle(project.name);
  setActions([
    `<button onclick="go('/projects/${id}/add-tests')">Add Tests</button>`,
    `<button class="secondary" onclick="go('/projects/${id}/results/new')">Log Custom Test</button>`,
    `<button class="secondary" onclick="go('/projects/${id}/report')">Generate Report</button>`,
    `<button class="secondary" onclick="go('/projects/${id}/edit')">Edit Project</button>`
  ]);
  const score = projectRiskScore(results);
  const resultRows = results.map((result) => `<tr>
    <td><span class="row-title"><strong>${escapeHtml(testName(result))}</strong><small>OWASP-style: ${escapeHtml(result.owaspMapping)}</small>${result.source === "Prompt Injection Playground" ? badge("Source: Playground", "neutral") : ""}${result.source === "RAG Attack Lab" ? badge("Source: RAG Attack Lab", "neutral") : ""}</span></td>
    <td>${badge(result.category, "neutral")}</td>
    <td>${badge(result.severity, result.severity)}</td>
    <td>${badge(result.resultStatus, result.resultStatus)}</td>
    <td>${Number(result.riskScore).toFixed(1)}</td>
    <td>${escapeHtml(result.evidenceNotes || "No evidence yet.")}</td>
    <td>${escapeHtml(result.dateTested)}</td>
    <td class="actions"><button class="secondary" onclick="go('/projects/${id}/results/${result.id}')">Edit</button><button class="danger" data-action="delete-result" data-project="${id}" data-id="${result.id}">Delete</button></td>
  </tr>`);
  app.innerHTML = `
    <section class="section">
      <div class="notice">A low score does not guarantee the AI system is secure. It only reflects the tests documented in this assessment.</div>
      <div class="grid">
        <article class="card span-7"><h2>Project overview</h2><div class="detail-list">${[
          ["Client/app", project.clientName],
          ["Industry", project.industry],
          ["AI system type", project.aiSystemType],
          ["Status", project.status],
          ["Objective", project.objective],
          ["Scope", project.scope]
        ]
          .map(([label, value]) => `<div class="detail"><span>${label}</span><p>${escapeHtml(value)}</p></div>`)
          .join("")}</div></article>
        <article class="card span-5">${riskMeter(score, riskLevel(score))}</article>
      </div>
    </section>
    <section class="grid">
      <div class="span-3">${stat("Tests selected", results.length)}</div>
      <div class="span-3">${stat("Completed", results.filter((r) => ["Passed", "Failed", "Partial"].includes(r.resultStatus)).length)}</div>
      <div class="span-3">${stat("Failed", results.filter((r) => r.resultStatus === "Failed").length)}</div>
      <div class="span-3">${stat("Partial", results.filter((r) => r.resultStatus === "Partial").length)}</div>
    </section>
    <section class="section">
      <div class="section-head"><div><h2>Test execution table</h2><p>Record evidence and scoring for each selected test.</p></div><button class="secondary" onclick="go('/projects/${id}/dashboard')">Project Dashboard</button></div>
      ${table(["Test name", "Category", "Severity", "Result status", "Risk score", "Evidence", "Date tested", "Actions"], resultRows, "No tests selected yet.")}
    </section>`;
}

export function renderAddTests(projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return renderNotFound("Project not found.");
  setTitle("Add Tests to Project");
  setActions([`<button class="secondary" onclick="go('/projects/${projectId}')">Back to Project</button>`]);
  const query = routeQuery();
  const search = query.get("q") || "";
  const category = query.get("category") || "";
  const severity = query.get("severity") || "";
  const type = query.get("type") || "";
  const preselected = query.get("test") || "";
  const attached = new Set(state.testResults.filter((result) => result.projectId === projectId).map((result) => result.testCaseId));
  const filtered = state.testCases.filter((test) => {
    const haystack = `${test.name} ${test.category} ${test.testType} ${test.tags.join(" ")}`.toLowerCase();
    return (
      (!search || haystack.includes(search.toLowerCase())) &&
      (!category || test.category === category) &&
      (!severity || test.severity === severity) &&
      (!type || test.testType === type)
    );
  });
  const rows = filtered.map((test) => `<tr>
    <td><label class="check"><input type="checkbox" name="testCaseIds" value="${test.id}" ${attached.has(test.id) ? "disabled" : ""} ${preselected === test.id && !attached.has(test.id) ? "checked" : ""} /> <span>${escapeHtml(test.name)}${attached.has(test.id) ? " (already added)" : ""}</span></label></td>
    <td>${badge(test.category, "neutral")}</td>
    <td>${badge(test.severity, test.severity)}</td>
    <td>${escapeHtml(test.testType)}</td>
  </tr>`);
  app.innerHTML = `
    <form class="section" id="add-tests-form">
      <div class="notice">Only add tests that are in scope for this authorized assessment.</div>
      <div class="filters">
        <input id="add-test-search" placeholder="Search tests or tags" value="${escapeHtml(search)}" />
        <select id="add-test-category"><option value="">All categories</option>${optionList(state.constants.categories, category)}</select>
        <select id="add-test-severity"><option value="">All severities</option>${optionList(state.constants.severities, severity)}</select>
        <select id="add-test-type"><option value="">All types</option>${optionList(state.constants.testTypes, type)}</select>
      </div>
      <div class="section-head">
        <p><strong id="selected-count">0</strong> selected from ${filtered.length} visible tests.</p>
        <button type="button" class="secondary" id="select-visible">Select all visible</button>
      </div>
      ${table(["Select", "Category", "Severity", "Type"], rows)}
      <div class="actions"><button type="submit">Add Selected Tests</button></div>
    </form>`;
  ["add-test-search", "add-test-category", "add-test-severity", "add-test-type"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => updateAddTestsFilters(projectId));
  });
  document.getElementById("select-visible").addEventListener("click", () => {
    document.querySelectorAll("#add-tests-form input[name='testCaseIds']:not(:disabled)").forEach((input) => {
      input.checked = true;
    });
    updateSelectedCount();
  });
  document.querySelectorAll("#add-tests-form input[name='testCaseIds']").forEach((input) => {
    input.addEventListener("change", updateSelectedCount);
  });
  updateSelectedCount();
  document.getElementById("add-tests-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const selected = [...event.currentTarget.querySelectorAll("input[name='testCaseIds']:checked")].map((input) => input.value);
    if (selected.length === 0) {
      showToast("Select at least one test");
      return;
    }
    await fetchJson(`/api/projects/${projectId}/add-tests`, { method: "POST", body: JSON.stringify({ testCaseIds: selected }) });
    showToast("Tests added");
    await loadState();
    go(`/projects/${projectId}`);
  });
}

export function updateAddTestsFilters(projectId) {
  const params = new URLSearchParams();
  const q = document.getElementById("add-test-search").value.trim();
  const category = document.getElementById("add-test-category").value;
  const severity = document.getElementById("add-test-severity").value;
  const type = document.getElementById("add-test-type").value;
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  if (severity) params.set("severity", severity);
  if (type) params.set("type", type);
  history.replaceState(null, "", `#/projects/${projectId}/add-tests${params.toString() ? `?${params}` : ""}`);
  renderAddTests(projectId);
}

export function updateSelectedCount() {
  const count = document.querySelectorAll("#add-tests-form input[name='testCaseIds']:checked").length;
  const node = document.getElementById("selected-count");
  if (node) node.textContent = String(count);
}

export async function renderResultForm(projectId, resultId = "") {
  const data = await getProject(projectId);
  const result = resultId && resultId !== "new" ? data.results.find((item) => item.id === resultId) : null;
  setTitle(result ? "Edit Test Result" : "Log Custom Test");
  setActions([`<button class="secondary" onclick="go('/projects/${projectId}')">Back to Project</button>`]);
  app.innerHTML = `
    <form class="form-panel" id="result-form">
      <div id="form-error"></div>
      <div class="form-grid">
        <label>Test case<input disabled value="${escapeHtml(result ? testName(result) : "Custom test")}" /></label>
        <label>Custom test name<input name="customTestName" value="${escapeHtml(result?.customTestName)}" /></label>
        <label>Category<select name="category">${optionList(state.constants.categories, result?.category || state.constants.categories[0])}</select></label>
        <label>OWASP-style mapping<select name="owaspMapping">${optionList(state.constants.owaspMappings, result?.owaspMapping || state.constants.owaspMappings[0])}</select></label>
        <label>Severity<select name="severity">${optionList(state.constants.severities, result?.severity || "Medium")}</select></label>
        <label>Result status<select name="resultStatus">${optionList(state.constants.resultStatuses, result?.resultStatus || "Not Tested")}</select></label>
        <label>Likelihood<select name="likelihood">${optionList(state.constants.likelihoods, result?.likelihood || "Medium")}</select></label>
        <label>Impact<select name="impact">${optionList(state.constants.impacts, result?.impact || "Medium")}</select></label>
        <label>Retest status<select name="retestStatus">${optionList(state.constants.retestStatuses, result?.retestStatus || "Not Retested")}</select></label>
        <label>Date tested<input name="dateTested" type="date" value="${escapeHtml(result?.dateTested || new Date().toISOString().slice(0, 10))}" /></label>
        <label class="field-wide">Actual prompt/input used<textarea name="actualPrompt" required>${escapeHtml(result?.actualPrompt)}</textarea></label>
        <label class="field-wide">Model/app response<textarea name="modelResponse">${escapeHtml(result?.modelResponse)}</textarea></label>
        <label class="field-wide">Evidence notes<textarea name="evidenceNotes">${escapeHtml(result?.evidenceNotes)}</textarea></label>
        <label>Screenshot/evidence URL<input name="evidenceUrl" value="${escapeHtml(result?.evidenceUrl)}" /></label>
        <label class="field-wide">Recommendation<textarea name="recommendation" required>${escapeHtml(result?.recommendation)}</textarea></label>
        <label class="field-wide">Tester notes<textarea name="testerNotes">${escapeHtml(result?.testerNotes)}</textarea></label>
      </div>
      <div class="actions"><button type="submit">Save Result</button></div>
    </form>`;
  document.getElementById("result-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = rowsFromForm(event.currentTarget);
      await fetchJson(result ? `/api/projects/${projectId}/results/${result.id}` : `/api/projects/${projectId}/results`, {
        method: result ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
      showToast("Result saved");
      await loadState();
      go(`/projects/${projectId}`);
    } catch (error) {
      document.getElementById("form-error").innerHTML = errorBox(error);
    }
  });
}

export async function renderProjectDashboard(projectId) {
  const data = await getProject(projectId);
  const results = data.results;
  const score = projectRiskScore(results);
  setTitle(`${data.project.name} Dashboard`);
  setActions([`<button class="secondary" onclick="go('/projects/${projectId}')">Project Workspace</button>`, `<button onclick="go('/projects/${projectId}/report')">Report</button>`]);
  const topFindings = [...results]
    .filter((result) => ["Failed", "Partial"].includes(result.resultStatus))
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 5)
    .map((result) => `<tr><td>${escapeHtml(testName(result))}</td><td>${badge(result.severity, result.severity)}</td><td>${badge(result.resultStatus, result.resultStatus)}</td><td>${Number(result.riskScore).toFixed(1)}</td></tr>`);
  app.innerHTML = `
    <section class="grid">
      <article class="card span-4">${riskMeter(score, riskLevel(score))}</article>
      <article class="card span-4"><h3>Result status distribution</h3>${chart(countsBy(results, "resultStatus"))}</article>
      <article class="card span-4"><h3>Severity distribution</h3>${chart(countsBy(results, "severity"))}</article>
      <article class="card span-6"><h3>Category breakdown</h3>${chart(countsBy(results, "category"))}</article>
      <article class="card span-6"><h3>Retest status summary</h3>${chart(countsBy(results, "retestStatus"))}</article>
      <section class="section span-12"><h2>Top 5 highest-risk findings</h2>${table(["Finding", "Severity", "Status", "Risk score"], topFindings, "No failed or partial findings.")}</section>
    </section>`;
}

