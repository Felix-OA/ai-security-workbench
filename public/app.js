const app = document.getElementById("app");
const pageTitle = document.getElementById("page-title");
const actions = document.getElementById("topbar-actions");
const toast = document.getElementById("toast");

const severityWeights = { Info: 0, Low: 2, Medium: 4, High: 7, Critical: 10 };
const likelihoodWeights = { Low: 1, Medium: 1.25, High: 1.5 };
const impactWeights = { Low: 1, Medium: 1.25, High: 1.5 };
const statusMultipliers = { "Not Tested": 0, Passed: 0, Failed: 1, Partial: 0.5, "Not Applicable": 0 };

let state = {
  constants: {},
  testCases: [],
  projects: [],
  testResults: []
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Request failed");
  return body;
}

async function loadState() {
  const data = await fetchJson("/api/workbench");
  state = {
    constants: data.constants,
    testCases: data.testCases,
    projects: await fetchJson("/api/projects"),
    testResults: data.testResults
  };
}

function setTitle(title, subtitle = "Red Team Test Library + Report Generator") {
  pageTitle.textContent = title;
  document.querySelector(".topbar .eyebrow").textContent = subtitle;
  actions.innerHTML = "";
}

function setActions(items) {
  actions.innerHTML = items.join("");
}

function routeParts() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [path] = hash.split("?");
  return path ? path.split("/") : [""];
}

function routeQuery() {
  const hash = location.hash.replace(/^#\/?/, "");
  return new URLSearchParams(hash.split("?")[1] || "");
}

function go(path) {
  location.hash = path;
}

function activeNav() {
  const top = routeParts()[0] || "";
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const key = link.dataset.nav;
    link.classList.toggle("active", key === top || (top === "" && key === "dashboard"));
  });
}

function findingScore(result) {
  const score =
    (severityWeights[result.severity] || 0) *
    (likelihoodWeights[result.likelihood] || 1) *
    (impactWeights[result.impact] || 1) *
    (statusMultipliers[result.resultStatus] || 0);
  return Math.round(score * 10) / 10;
}

function projectRiskScore(results) {
  const tested = results.filter((result) => ["Passed", "Failed", "Partial"].includes(result.resultStatus));
  if (!tested.length) return 0;
  const total = tested.reduce((sum, result) => sum + Number(result.riskScore ?? findingScore(result)), 0);
  return Math.round((total / (tested.length * 22.5)) * 100);
}

function riskLevel(score) {
  if (score >= 75) return "Critical";
  if (score >= 50) return "High";
  if (score >= 25) return "Medium";
  return "Low";
}

function badge(value, kind = value) {
  const className = String(kind || value).toLowerCase().replaceAll(" ", "-").replaceAll("/", "").replaceAll("_", "-");
  return `<span class="badge ${className}">${escapeHtml(value)}</span>`;
}

function tags(tags = []) {
  return `<div class="tag-row">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>`;
}

function testName(result) {
  return result.customTestName || state.testCases.find((test) => test.id === result.testCaseId)?.name || "Custom test";
}

function optionList(values, selected = "") {
  return values.map((value) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
}

function stat(label, value, hint = "") {
  return `<div class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${hint ? `<small>${escapeHtml(hint)}</small>` : ""}</div>`;
}

function countsBy(items, field) {
  return items.reduce((acc, item) => {
    const key = item[field] || "Unspecified";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function chart(counts) {
  const entries = Object.entries(counts);
  const max = Math.max(1, ...entries.map(([, count]) => count));
  if (!entries.length) return `<div class="empty">No data yet.</div>`;
  return `<div class="chart">${entries
    .map(([name, count]) => {
      const width = Math.max(4, Math.round((count / max) * 100));
      return `<div class="bar-row"><strong>${escapeHtml(name)}</strong><div class="bar"><span style="width:${width}%"></span></div><span>${count}</span></div>`;
    })
    .join("")}</div>`;
}

function table(headers, rows, emptyText = "No records yet.") {
  if (!rows.length) return `<div class="empty">${escapeHtml(emptyText)}</div>`;
  return `<div class="table-wrap"><table><thead><tr>${headers.map((head) => `<th>${escapeHtml(head)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function rowsFromForm(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  form.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    data[input.name] = input.checked;
  });
  return data;
}

function errorBox(error) {
  return `<div class="error">${escapeHtml(error.message || error)}</div>`;
}

function inlineMarkdown(value) {
  return escapeHtml(value).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

function markdownToHtml(markdown) {
  const lines = markdown.split("\n");
  let html = "";
  let inList = false;
  let tableRows = [];
  const flushList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };
  const flushTable = () => {
    if (!tableRows.length) return;
    const [header, separator, ...body] = tableRows;
    const cells = (row) => row.split("|").slice(1, -1).map((cell) => inlineMarkdown(cell.trim()));
    html += `<div class="table-wrap report-table"><table><thead><tr>${cells(header).map((cell) => `<th>${cell}</th>`).join("")}</tr></thead><tbody>${body
      .filter((row) => row !== separator)
      .map((row) => `<tr>${cells(row).map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></div>`;
    tableRows = [];
  };

  lines.forEach((line) => {
    if (line.trim().startsWith("|")) {
      flushList();
      tableRows.push(line);
      return;
    }
    flushTable();
    if (line.startsWith("# ")) {
      flushList();
      html += `<h1>${inlineMarkdown(line.slice(2))}</h1>`;
    } else if (line.startsWith("## ")) {
      flushList();
      html += `<h2>${inlineMarkdown(line.slice(3))}</h2>`;
    } else if (line.startsWith("### ")) {
      flushList();
      html += `<h3>${inlineMarkdown(line.slice(4))}</h3>`;
    } else if (line.startsWith("* ")) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inlineMarkdown(line.slice(2))}</li>`;
    } else if (line.startsWith("- ")) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inlineMarkdown(line.slice(2))}</li>`;
    } else if (line.startsWith("> ")) {
      flushList();
      html += `<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`;
    } else if (line.trim()) {
      flushList();
      html += `<p>${inlineMarkdown(line)}</p>`;
    }
  });
  flushList();
  flushTable();
  return html;
}

function renderLanding() {
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
        ${["Red Team Test Library", "Project Assessments", "Risk Dashboard", "Report Generator"]
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
    "Project Assessments": "Scoped assessment workspaces with authorization tracking and manual evidence capture.",
    "Risk Dashboard": "Portfolio and project-level metrics for severity, status, category, and remediation posture.",
    "Report Generator": "Copy, download, or print structured AI Risk Snapshot reports."
  }[title];
}

function renderDashboard() {
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

function renderTests() {
  setTitle("Test Library");
  setActions([
    `<button onclick="go('/tests/new')">Add Test Case</button>`,
    `<button class="secondary" data-action="seed">Reset Demo Data</button>`
  ]);
  const search = routeQuery();
  const query = search.get("q") || "";
  const category = search.get("category") || "";
  const severity = search.get("severity") || "";
  const type = search.get("type") || "";
  const filtered = state.testCases.filter((test) => {
    const haystack = `${test.name} ${test.category} ${test.testType} ${test.tags.join(" ")}`.toLowerCase();
    return (
      (!query || haystack.includes(query.toLowerCase())) &&
      (!category || test.category === category) &&
      (!severity || test.severity === severity) &&
      (!type || test.testType === type)
    );
  });
  const rows = filtered.map((test) => `<tr>
    <td><span class="row-title"><strong>${escapeHtml(test.name)}</strong><small>${escapeHtml(test.description)}</small></span></td>
    <td>${badge(test.category, "neutral")}</td>
    <td>${escapeHtml(test.owaspMapping)}</td>
    <td>${badge(test.severity, test.severity)}</td>
    <td>${escapeHtml(test.testType)}</td>
    <td>${tags(test.tags)}</td>
    <td>${new Date(test.createdAt).toLocaleDateString()}</td>
    <td class="actions">
      <button class="secondary icon" title="View" onclick="go('/tests/${test.id}')">View</button>
      <button class="secondary icon" title="Edit" onclick="go('/tests/${test.id}/edit')">Edit</button>
      <button class="secondary icon" title="Duplicate" data-action="duplicate-test" data-id="${test.id}">Copy</button>
      <button class="danger icon" title="Delete" data-action="delete-test" data-id="${test.id}">Delete</button>
    </td>
  </tr>`);
  app.innerHTML = `
    <section class="section">
      <div class="filters">
        <input id="test-search" placeholder="Search tests or tags" value="${escapeHtml(query)}" />
        <select id="test-category"><option value="">All categories</option>${optionList(state.constants.categories, category)}</select>
        <select id="test-severity"><option value="">All severities</option>${optionList(state.constants.severities, severity)}</select>
        <select id="test-type"><option value="">All types</option>${optionList(state.constants.testTypes, type)}</select>
      </div>
      ${table(["Test name", "Category", "OWASP-style risk mapping", "Severity", "Test type", "Tags", "Created", "Actions"], rows, "No tests match these filters.")}
    </section>`;
  ["test-search", "test-category", "test-severity", "test-type"].forEach((id) => {
    document.getElementById(id).addEventListener("input", updateTestFilters);
  });
}

function updateTestFilters() {
  const params = new URLSearchParams();
  const q = document.getElementById("test-search").value.trim();
  const category = document.getElementById("test-category").value;
  const severity = document.getElementById("test-severity").value;
  const type = document.getElementById("test-type").value;
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  if (severity) params.set("severity", severity);
  if (type) params.set("type", type);
  history.replaceState(null, "", `#/tests${params.toString() ? `?${params}` : ""}`);
  renderTests();
}

function renderTestForm(id = "") {
  const test = id ? state.testCases.find((item) => item.id === id) : null;
  setTitle(test ? "Edit Test Case" : "New Test Case");
  setActions([`<button class="secondary" onclick="go('/tests')">Back to Library</button>`]);
  app.innerHTML = `
    <form class="form-panel" id="test-form">
      <div id="form-error"></div>
      <div class="form-grid">
        <label>Test name<input name="name" required value="${escapeHtml(test?.name)}" /></label>
        <label>Severity<select name="severity">${optionList(state.constants.severities, test?.severity || "Medium")}</select></label>
        <label>Category<select name="category">${optionList(state.constants.categories, test?.category || state.constants.categories[0])}</select></label>
        <label>OWASP risk mapping<select name="owaspMapping">${optionList(state.constants.owaspMappings, test?.owaspMapping || state.constants.owaspMappings[0])}</select></label>
        <label class="field-wide">Test type<select name="testType">${optionList(state.constants.testTypes, test?.testType || state.constants.testTypes[0])}</select></label>
        <label class="field-wide">Description<textarea name="description">${escapeHtml(test?.description)}</textarea></label>
        <label class="field-wide">Prompt/test input<textarea name="prompt" required>${escapeHtml(test?.prompt)}</textarea></label>
        <label class="field-wide">Expected safe behavior<textarea name="expectedBehavior" required>${escapeHtml(test?.expectedBehavior)}</textarea></label>
        <label class="field-wide">Failure indicators<textarea name="failureIndicators" required>${escapeHtml(test?.failureIndicators)}</textarea></label>
        <label class="field-wide">Recommended mitigation<textarea name="recommendedMitigation" required>${escapeHtml(test?.recommendedMitigation)}</textarea></label>
        <label class="field-wide">Evaluation criteria<textarea name="evaluationCriteria">${escapeHtml(test?.evaluationCriteria)}</textarea></label>
        <label>Pass condition<textarea name="passCondition">${escapeHtml(test?.passCondition)}</textarea></label>
        <label>Fail condition<textarea name="failCondition">${escapeHtml(test?.failCondition)}</textarea></label>
        <label>Partial condition<textarea name="partialCondition">${escapeHtml(test?.partialCondition)}</textarea></label>
        <label class="field-wide">Evidence guidance<textarea name="evidenceGuidance">${escapeHtml(test?.evidenceGuidance)}</textarea></label>
        <label>Tags<input name="tags" placeholder="prompt-injection, rag" value="${escapeHtml((test?.tags || []).join(", "))}" /></label>
        <label>Notes<input name="notes" value="${escapeHtml(test?.notes)}" /></label>
      </div>
      <div class="actions"><button type="submit">${test ? "Save Test Case" : "Create Test Case"}</button></div>
    </form>`;
  document.getElementById("test-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = rowsFromForm(event.currentTarget);
      const saved = await fetchJson(test ? `/api/tests/${test.id}` : "/api/tests", {
        method: test ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
      showToast("Test case saved");
      await loadState();
      go(`/tests/${saved.id}`);
    } catch (error) {
      document.getElementById("form-error").innerHTML = errorBox(error);
    }
  });
}

function renderTestDetail(id) {
  const test = state.testCases.find((item) => item.id === id);
  if (!test) return renderNotFound("Test case not found.");
  setTitle(test.name);
  setActions([
    `<button onclick="go('/tests/${test.id}/use')">Use in Project</button>`,
    `<button class="secondary" onclick="go('/tests/${test.id}/edit')">Edit</button>`,
    `<button class="secondary" onclick="go('/tests')">Back</button>`
  ]);
  app.innerHTML = `
    <section class="grid">
      <article class="card span-8">
        <h2>${escapeHtml(test.name)}</h2>
        <p>${escapeHtml(test.description)}</p>
        <div class="tag-row">${badge(test.category, "neutral")}${badge(test.severity, test.severity)}${badge(test.testType, "neutral")}</div>
      </article>
      <article class="card span-4"><h3>Risk mapping</h3><p>${escapeHtml(test.owaspMapping)}</p>${tags(test.tags)}</article>
      ${detailCard("Test prompt/input", test.prompt)}
      ${detailCard("Expected behavior", test.expectedBehavior)}
      ${detailCard("Failure indicators", test.failureIndicators)}
      ${detailCard("Mitigation guidance", test.recommendedMitigation)}
      ${detailCard("Evaluation criteria", test.evaluationCriteria)}
      ${detailCard("Pass condition", test.passCondition)}
      ${detailCard("Fail condition", test.failCondition)}
      ${detailCard("Partial condition", test.partialCondition)}
      ${detailCard("Evidence guidance", test.evidenceGuidance)}
      ${detailCard("Notes", test.notes || "No notes documented.")}
    </section>`;
}

function renderUseInProject(testId) {
  const test = state.testCases.find((item) => item.id === testId);
  if (!test) return renderNotFound("Test case not found.");
  setTitle("Use Test in Project");
  setActions([`<button class="secondary" onclick="go('/tests/${testId}')">Back to Test</button>`]);
  const rows = state.projects.map((project) => {
    const alreadyAttached = state.testResults.some((result) => result.projectId === project.id && result.testCaseId === test.id);
    return `<tr>
      <td><span class="row-title"><strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(project.clientName)}</small></span></td>
      <td>${badge(project.status, "neutral")}</td>
      <td>${badge(project.riskLevel, project.riskLevel)}</td>
      <td>${project.testCount}</td>
      <td><button ${alreadyAttached ? "disabled" : ""} data-action="attach-test" data-project="${project.id}" data-test="${test.id}">${alreadyAttached ? "Already attached" : "Attach"}</button></td>
    </tr>`;
  });
  app.innerHTML = `
    <section class="section">
      <article class="card">
        <h2>${escapeHtml(test.name)}</h2>
        <p class="muted">Choose an existing authorized assessment project to attach this test case.</p>
        <div class="tag-row">${badge(test.category, "neutral")}${badge(test.severity, test.severity)}${badge(test.testType, "neutral")}</div>
      </article>
      ${table(["Project", "Status", "Risk", "Tests", "Action"], rows, "Create a project before attaching tests.")}
    </section>`;
}

function detailCard(title, text) {
  return `<article class="card span-6"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></article>`;
}

function renderProjects() {
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

function updateProjectFilters() {
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

function renderProjectForm(id = "") {
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

async function getProject(id) {
  return fetchJson(`/api/projects/${id}`);
}

async function renderProjectDetail(id) {
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
    <td><span class="row-title"><strong>${escapeHtml(testName(result))}</strong><small>${escapeHtml(result.owaspMapping)}</small></span></td>
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

function riskMeter(score, level) {
  return `<div class="risk-meter"><span class="muted">Overall documented risk</span><div class="score">${score}</div>${badge(level, level)}<div class="meter-track"><span style="width:${Math.max(3, score)}%"></span></div><p class="muted">Only Passed, Failed, and Partial results are included in the denominator.</p></div>`;
}

function renderAddTests(projectId) {
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

function updateAddTestsFilters(projectId) {
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

function updateSelectedCount() {
  const count = document.querySelectorAll("#add-tests-form input[name='testCaseIds']:checked").length;
  const node = document.getElementById("selected-count");
  if (node) node.textContent = String(count);
}

async function renderResultForm(projectId, resultId = "") {
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
        <label>OWASP mapping<select name="owaspMapping">${optionList(state.constants.owaspMappings, result?.owaspMapping || state.constants.owaspMappings[0])}</select></label>
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

async function renderProjectDashboard(projectId) {
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

async function renderReport(projectId) {
  const data = await getProject(projectId);
  const report = await fetchJson(`/api/projects/${projectId}/report`);
  setTitle("AI Risk Snapshot Report");
  setActions([
    `<button data-action="copy-report">Copy Markdown</button>`,
    `<button class="secondary" data-action="download-report" data-name="${escapeHtml(data.project.name)}">Download Markdown</button>`,
    `<button class="secondary" onclick="window.print()">Print Report</button>`
  ]);
  app.innerHTML = `
    <section class="section">
      <div class="notice">This report is for authorized defensive testing documentation. Markdown export remains available for client notes or repository artifacts.</div>
      <article class="report-document">${markdownToHtml(report.markdown)}</article>
      <textarea id="report-markdown" hidden>${escapeHtml(report.markdown)}</textarea>
    </section>`;
}

async function renderSampleReport() {
  await renderReport("sample-project");
}

function renderAbout() {
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

function renderNotFound(message = "Page not found.") {
  setTitle("Not Found");
  setActions([`<button onclick="go('/dashboard')">Open Dashboard</button>`]);
  app.innerHTML = `<div class="empty"><strong>${escapeHtml(message)}</strong><span>Use the sidebar to continue.</span></div>`;
}

async function render() {
  try {
    await loadState();
    activeNav();
    const [top, id, action, subId] = routeParts();
    if (!top) return renderLanding();
    if (top === "dashboard") return renderDashboard();
    if (top === "tests" && !id) return renderTests();
    if (top === "tests" && id === "new") return renderTestForm();
    if (top === "tests" && action === "edit") return renderTestForm(id);
    if (top === "tests" && action === "use") return renderUseInProject(id);
    if (top === "tests" && id) return renderTestDetail(id);
    if (top === "projects" && !id) return renderProjects();
    if (top === "projects" && id === "new") return renderProjectForm();
    if (top === "projects" && action === "edit") return renderProjectForm(id);
    if (top === "projects" && action === "add-tests") return renderAddTests(id);
    if (top === "projects" && action === "results") return renderResultForm(id, subId || "new");
    if (top === "projects" && action === "dashboard") return renderProjectDashboard(id);
    if (top === "projects" && action === "report") return renderReport(id);
    if (top === "projects" && id) return renderProjectDetail(id);
    if (top === "sample-report") return renderSampleReport();
    if (top === "about") return renderAbout();
    return renderNotFound();
  } catch (error) {
    setTitle("Something went wrong");
    app.innerHTML = errorBox(error);
  }
}

document.body.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  try {
    if (action === "seed") {
      await fetchJson("/api/workbench/seed", { method: "POST" });
      showToast("Seed data imported");
      return render();
    }
    if (action === "duplicate-test") {
      await fetchJson(`/api/tests/${target.dataset.id}/duplicate`, { method: "POST" });
      showToast("Test duplicated");
      return render();
    }
    if (action === "delete-test") {
      if (!confirm("Delete this test case? Existing project results will keep their recorded details.")) return;
      await fetchJson(`/api/tests/${target.dataset.id}`, { method: "DELETE" });
      showToast("Test deleted");
      return render();
    }
    if (action === "delete-result") {
      if (!confirm("Delete this test result?")) return;
      await fetchJson(`/api/projects/${target.dataset.project}/results/${target.dataset.id}`, { method: "DELETE" });
      showToast("Result deleted");
      await loadState();
      return renderProjectDetail(target.dataset.project);
    }
    if (action === "attach-test") {
      const created = await fetchJson(`/api/projects/${target.dataset.project}/add-tests`, {
        method: "POST",
        body: JSON.stringify({ testCaseIds: [target.dataset.test] })
      });
      showToast(created.length ? "Test attached to project" : "Test was already attached");
      await loadState();
      return go(`/projects/${target.dataset.project}`);
    }
    if (action === "copy-report") {
      const markdown = document.getElementById("report-markdown").value || document.getElementById("report-markdown").textContent;
      await navigator.clipboard.writeText(markdown);
      showToast("Report copied");
    }
    if (action === "download-report") {
      const markdown = document.getElementById("report-markdown").value || document.getElementById("report-markdown").textContent;
      const blob = new Blob([markdown], { type: "text/markdown" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${(target.dataset.name || "ai-risk-snapshot").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;
      link.click();
      URL.revokeObjectURL(link.href);
    }
  } catch (error) {
    showToast(error.message || "Action failed");
  }
});

window.addEventListener("hashchange", render);
render();
