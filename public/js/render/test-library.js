import { app } from "../dom.js";
import { fetchJson } from "../api.js";
import { state, loadState } from "../state.js";
import { setTitle, setActions } from "../layout.js";
import { go, routeQuery } from "../navigation.js";
import { showToast } from "../toast.js";
import { escapeHtml, rowsFromForm } from "../utils.js";
import { badge, tags } from "../components/badges.js";
import { optionList, errorBox } from "../components/forms.js";
import { table } from "../components/tables.js";
import { detailCard } from "../components/cards.js";
import { renderNotFound } from "./static-pages.js";

export function renderTests() {
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
      <button class="secondary icon" title="Open in Playground" onclick="go('/playground?test=${test.id}')">Playground</button>
      <button class="secondary icon" title="Open in RAG Lab" onclick="go('/rag-lab?test=${test.id}')">RAG Lab</button>
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

export function renderTestForm(id = "") {
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
        <label>OWASP-style risk mapping<select name="owaspMapping">${optionList(state.constants.owaspMappings, test?.owaspMapping || state.constants.owaspMappings[0])}</select></label>
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

export function renderTestDetail(id) {
  const test = state.testCases.find((item) => item.id === id);
  if (!test) return renderNotFound("Test case not found.");
  setTitle(test.name);
  setActions([
    `<button onclick="go('/tests/${test.id}/use')">Use in Project</button>`,
    `<button class="secondary" onclick="go('/playground?test=${test.id}')">Open in Playground</button>`,
    `<button class="secondary" onclick="go('/rag-lab?test=${test.id}')">Open in RAG Lab</button>`,
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

export function renderUseInProject(testId) {
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
