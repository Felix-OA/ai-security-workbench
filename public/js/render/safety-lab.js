import { app } from "../dom.js";
import { state } from "../state.js";
import { setTitle, setActions } from "../layout.js";
import { go, routeQuery } from "../navigation.js";
import { findingScore, riskLevel } from "../scoring.js";
import { escapeHtml, rowsFromForm } from "../utils.js";
import { badge } from "../components/badges.js";
import { optionList } from "../components/forms.js";
import { table } from "../components/tables.js";
import { stat, riskMeter } from "../components/cards.js";
import { safetyRunName } from "../names.js";

export function safetyCampaignSummary(campaign, runs) {
  const campaignRuns = runs.filter((run) => run.campaignId === campaign?.id);
  const completed = campaignRuns.filter((run) => ["Passed", "Failed", "Partial"].includes(run.resultStatus));
  const passed = campaignRuns.filter((run) => run.resultStatus === "Passed").length;
  const failed = campaignRuns.filter((run) => run.resultStatus === "Failed").length;
  const partial = campaignRuns.filter((run) => run.resultStatus === "Partial").length;
  const notTested = campaignRuns.filter((run) => run.resultStatus === "Not Tested").length;
  const highCriticalFailures = campaignRuns.filter((run) => run.resultStatus === "Failed" && ["High", "Critical"].includes(run.severity)).length;
  const safeResults = passed + partial * 0.5;
  const refusalConsistencyScore = completed.length ? Math.round((safeResults / completed.length) * 100) : 0;
  const averageRiskScore = completed.length ? Math.round((completed.reduce((sum, run) => sum + Number(run.riskScore || 0), 0) / completed.length) * 10) / 10 : 0;
  return {
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

function consistencyLabel(score) {
  if (score >= 90) return "Strong consistency";
  if (score >= 75) return "Good consistency";
  if (score >= 50) return "Moderate consistency";
  return "Weak consistency";
}

function blankCampaign() {
  return {
    id: "",
    name: "New Safety Regression Campaign",
    targetSystem: "",
    modelVersion: "",
    environment: "Staging",
    objective: "",
    scope: "",
    outOfScope: "",
    testerName: "",
    assessmentDate: new Date().toISOString().slice(0, 10),
    status: "Draft",
    authorizationConfirmed: false,
    notes: ""
  };
}

function blankRun(campaignId = "") {
  return {
    id: "",
    campaignId,
    templateId: "",
    name: "Custom safety test",
    safetyTestType: "Refusal Boundary Test",
    category: "Policy Bypass",
    owaspMapping: "LLM01:2025 Prompt Injection",
    severity: "Medium",
    testPrompt: "",
    expectedSafeBehavior: "",
    failureIndicators: "",
    evaluationCriteria: "",
    observedResponse: "",
    resultStatus: "Not Tested",
    likelihood: "Medium",
    impact: "Medium",
    riskScore: 0,
    evidenceNotes: "",
    recommendation: "",
    retestStatus: "Not Retested",
    mitigationApplied: "",
    retestObservedResponse: "",
    retestNotes: "",
    retestDate: "",
    testerNotes: "",
    dateTested: new Date().toISOString().slice(0, 10)
  };
}

function selectedCampaign() {
  const query = routeQuery();
  const id = query.get("campaign") || state.safetyCampaigns[0]?.id || "";
  return state.safetyCampaigns.find((campaign) => campaign.id === id) || state.safetyCampaigns[0] || blankCampaign();
}

function selectedRun(campaign) {
  const query = routeQuery();
  const runId = query.get("run") || "";
  const templateId = query.get("template") || "";
  const existing = state.safetyRuns.find((run) => run.id === runId);
  if (existing) return existing;
  const template = state.safetyTemplates.find((item) => item.id === templateId);
  if (template) {
    return {
      ...blankRun(campaign.id),
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
      recommendation: template.recommendedMitigation
    };
  }
  return blankRun(campaign.id);
}

export function safetyCampaignPayload() {
  return rowsFromForm(document.getElementById("safety-campaign-form"));
}

export function safetyRunPayload() {
  const form = document.getElementById("safety-run-form");
  const payload = rowsFromForm(form);
  payload.campaignId = document.getElementById("safety-campaign-selector")?.value || payload.campaignId;
  return payload;
}

export function currentSafetyRunId() {
  const runId = routeQuery().get("run") || "";
  return state.safetyRuns.some((run) => run.id === runId) ? runId : "";
}

export function currentSafetyCampaignId() {
  const campaignId = routeQuery().get("campaign") || state.safetyCampaigns[0]?.id || "";
  return state.safetyCampaigns.some((campaign) => campaign.id === campaignId) ? campaignId : "";
}

export function selectedSafetyRunIds() {
  return [...document.querySelectorAll("input[name='safetyRunIds']:checked")].map((input) => input.value);
}

export function updateSafetyRiskPreview() {
  const scoreNode = document.getElementById("safety-risk-score");
  const levelNode = document.getElementById("safety-risk-level");
  const score = findingScore(safetyRunPayload());
  const level = riskLevel(Math.round((score / 22.5) * 100));
  if (scoreNode) scoreNode.textContent = score.toFixed(1);
  if (levelNode) levelNode.innerHTML = badge(level, level);
}

function runRows(campaign) {
  const query = routeQuery();
  const status = query.get("status") || "";
  const severity = query.get("severity") || "";
  const type = query.get("type") || "";
  const retest = query.get("retest") || "";
  const runs = state.safetyRuns
    .filter((run) => run.campaignId === campaign.id)
    .filter((run) => (!status || run.resultStatus === status) && (!severity || run.severity === severity) && (!type || run.safetyTestType === type) && (!retest || run.retestStatus === retest));
  return runs.map((run) => {
    const savable = ["Passed", "Failed", "Partial"].includes(run.resultStatus);
    return `<tr>
    <td><label class="check"><input type="checkbox" name="safetyRunIds" value="${escapeHtml(run.id)}" ${savable ? "" : "disabled"} /> <span>${savable ? "Select" : "Not savable"}</span></label></td>
    <td><span class="row-title"><strong>${escapeHtml(safetyRunName(run))}</strong><small>${escapeHtml(run.safetyTestType)}</small></span></td>
    <td>${badge(run.category, "neutral")}</td>
    <td>${badge(run.severity, run.severity)}</td>
    <td>${badge(run.resultStatus, run.resultStatus)}</td>
    <td>${Number(run.riskScore || 0).toFixed(1)}</td>
    <td>${badge(run.retestStatus || "Not Retested", "neutral")}</td>
    <td>${run.projectId ? badge("Saved to project", "low") : badge("Campaign only", "neutral")}</td>
    <td><button class="secondary" onclick="go('/safety-lab?campaign=${campaign.id}&run=${run.id}')">Open</button></td>
  </tr>`;
  });
}

export function renderSafetyLab() {
  const campaign = selectedCampaign();
  const run = selectedRun(campaign);
  const summary = safetyCampaignSummary(campaign, state.safetyRuns);
  const riskScore = findingScore(run);
  const campaignOptions = state.safetyCampaigns
    .map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === campaign.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`)
    .join("");
  const templateOptions = state.safetyTemplates
    .map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}</option>`)
    .join("");
  const query = routeQuery();
  const status = query.get("status") || "";
  const severity = query.get("severity") || "";
  const type = query.get("type") || "";
  const retest = query.get("retest") || "";

  setTitle("Jailbreak & Safety Regression Lab", "Document authorized jailbreak resistance and safety regression testing across LLM applications.");
  setActions([
    `<button class="secondary" onclick="go('/safety-lab?campaign=sample-safety-campaign')">Load Demo Campaign</button>`,
    `<button class="secondary" onclick="go('/safety-lab?new=campaign')">New Campaign</button>`
  ]);

  const editingNewCampaign = routeQuery().get("new") === "campaign" || !campaign.id;
  const campaignData = editingNewCampaign ? blankCampaign() : campaign;
  const rows = runRows(campaign);

  app.innerHTML = `
    <section class="playground-intro">
      <div>
        <p class="eyebrow">Safety Lab</p>
        <h2>Campaign-style safety boundary testing</h2>
        <p>Structure authorized jailbreak resistance tests, evaluate refusal consistency, and track safety regressions across AI app versions.</p>
      </div>
      <div class="workflow-chips">
        ${badge("Authorized testing only", "neutral")}
        ${badge("Manual observed response", "neutral")}
        ${badge(consistencyLabel(summary.refusalConsistencyScore), summary.refusalConsistencyScore >= 75 ? "low" : "medium")}
      </div>
      <div class="notice notice-compact">Use this lab only for authorized AI security testing, internal assessments, demos, and education. Do not use it to test systems you do not own or have explicit permission to assess.</div>
      <div class="notice notice-compact manual-notice">This lab does not execute live model calls in this version. Run your authorized test in the AI app being assessed, paste the observed response here, then evaluate the result.</div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>How this lab works</h2><p>Follow this flow when documenting an authorized safety regression test.</p></div></div>
      <ol class="workflow-list">
        <li>Create or load a safety regression campaign for one AI app/version.</li>
        <li>Open a safety test template or existing test run.</li>
        <li>Run the authorized test in the AI app being assessed.</li>
        <li>Paste the observed response here.</li>
        <li>Evaluate the result as Passed, Partial, or Failed.</li>
        <li>Add mitigation and retest notes if applicable.</li>
        <li>Save findings to a project so they appear in dashboards and reports.</li>
      </ol>
    </section>

    <section class="grid">
      <article class="section span-8">
        <div class="section-head"><div><h2>Safety campaign</h2><p>A campaign groups multiple safety-boundary tests for one AI app/version so results can be compared over time.</p></div></div>
        <form id="safety-campaign-form" class="form-grid compact-form-grid">
          <input type="hidden" name="id" value="${escapeHtml(campaignData.id)}" />
          <label>Load campaign<select id="safety-campaign-selector">${campaignOptions}</select></label>
          <label>Campaign name<input name="name" required value="${escapeHtml(campaignData.name)}" /></label>
          <label>Target app/system<input name="targetSystem" required value="${escapeHtml(campaignData.targetSystem)}" /></label>
          <label>Model/app version<input name="modelVersion" required value="${escapeHtml(campaignData.modelVersion)}" /></label>
          <label>Environment<select name="environment">${optionList(state.constants.safetyEnvironments || [], campaignData.environment)}</select></label>
          <label>Status<select name="status">${optionList(state.constants.safetyCampaignStatuses || [], campaignData.status)}</select></label>
          <label>Tester name<input name="testerName" required value="${escapeHtml(campaignData.testerName)}" /></label>
          <label>Assessment date<input name="assessmentDate" type="date" value="${escapeHtml(campaignData.assessmentDate)}" /></label>
          <label class="field-wide">Assessment objective<textarea name="objective" required>${escapeHtml(campaignData.objective)}</textarea></label>
          <label class="field-wide">Scope<textarea name="scope" required>${escapeHtml(campaignData.scope)}</textarea></label>
          <label class="field-wide">Out of scope<textarea name="outOfScope">${escapeHtml(campaignData.outOfScope)}</textarea></label>
          <label class="field-wide">Notes<textarea name="notes">${escapeHtml(campaignData.notes)}</textarea></label>
          <label class="check field-wide"><input type="checkbox" name="authorizationConfirmed" ${campaignData.authorizationConfirmed ? "checked" : ""} required /> I confirm this campaign is authorized.</label>
        </form>
        <div class="actions"><button type="button" data-action="save-safety-campaign">${campaignData.id ? "Save Campaign" : "Create Campaign"}</button></div>
      </article>

      <aside class="section span-4">
        <h2>Regression summary</h2>
        ${riskMeter(summary.refusalConsistencyScore, consistencyLabel(summary.refusalConsistencyScore))}
        <p class="muted">This score is a simple documentation metric. It does not guarantee system safety.</p>
        <div class="grid tight-grid">
          <div class="span-6">${stat("Total tests", summary.totalTests)}</div>
          <div class="span-6">${stat("Completed", summary.completedTests)}</div>
          <div class="span-6">${stat("Passed", summary.passed)}</div>
          <div class="span-6">${stat("Failed", summary.failed)}</div>
          <div class="span-6">${stat("Partial", summary.partial)}</div>
          <div class="span-6">${stat("High/Critical", summary.highCriticalFailures)}</div>
        </div>
      </aside>
    </section>

    <section class="section">
      <div class="section-head">
        <div><h2>Safety test executions</h2><p>Document prompts, observed behavior, evaluation, and retest status.</p></div>
        <div class="actions">
          <select id="safety-template-picker"><option value="">Choose template</option>${templateOptions}</select>
          <button type="button" class="secondary" data-action="add-safety-template-run">Add from Template</button>
          <button type="button" onclick="go('/safety-lab?campaign=${campaign.id}')">Add Custom Safety Test</button>
        </div>
      </div>
      <div class="filters">
        <select id="safety-filter-status"><option value="">All statuses</option>${optionList(state.constants.resultStatuses || [], status)}</select>
        <select id="safety-filter-severity"><option value="">All severities</option>${optionList(state.constants.severities || [], severity)}</select>
        <select id="safety-filter-type"><option value="">All types</option>${optionList(state.constants.safetyTestTypes || [], type)}</select>
        <select id="safety-filter-retest"><option value="">All retest statuses</option>${optionList(state.constants.safetyRetestStatuses || [], retest)}</select>
      </div>
      ${table(["Select", "Test", "Category", "Severity", "Status", "Risk", "Retest", "Project", "Actions"], rows, "No safety tests match this campaign/filter.")}
      <div class="section-head">
        <p><strong id="selected-safety-count">0</strong> selected completed run(s).</p>
        <div class="actions">
          <select id="safety-project"><option value="">Select project</option>${state.projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`).join("")}</select>
          <button type="button" class="secondary" data-action="save-selected-safety-findings">Save Selected Findings to Project</button>
          <button type="button" class="secondary" data-action="save-safety-findings">Save All Failed/Partial Findings to Project</button>
          <button type="button" class="secondary" data-action="save-safety-completed">Save All Completed Findings to Project</button>
        </div>
      </div>
    </section>

    <form id="safety-run-form" class="grid">
      <input type="hidden" name="id" value="${escapeHtml(run.id)}" />
      <input type="hidden" name="campaignId" value="${escapeHtml(campaign.id)}" />
      <input type="hidden" name="templateId" value="${escapeHtml(run.templateId)}" />
      <section class="section span-8">
        <div class="section-head"><div><h2>Test detail</h2><p>Paste observed AI/app behavior from the authorized system under test.</p></div>${badge(run.safetyTestType, "neutral")}</div>
        <div class="form-grid compact-form-grid">
          <label>Test name<input name="name" required value="${escapeHtml(run.name)}" /></label>
          <label>Safety test type<select name="safetyTestType">${optionList(state.constants.safetyTestTypes || [], run.safetyTestType)}</select></label>
          <label>Category<select name="category">${optionList(state.constants.categories || [], run.category)}</select></label>
          <label>OWASP-style mapping<select name="owaspMapping">${optionList(state.constants.owaspMappings || [], run.owaspMapping)}</select></label>
          <label>Severity<select name="severity" id="safety-severity">${optionList(state.constants.severities || [], run.severity)}</select></label>
          <label>Date tested<input name="dateTested" type="date" value="${escapeHtml(run.dateTested)}" /></label>
          <label class="field-wide">Test prompt<textarea name="testPrompt" required>${escapeHtml(run.testPrompt)}</textarea></label>
          <label class="field-wide">Expected safe behavior<textarea name="expectedSafeBehavior" required>${escapeHtml(run.expectedSafeBehavior)}</textarea></label>
          <label class="field-wide">Failure indicators<textarea name="failureIndicators" required>${escapeHtml(run.failureIndicators)}</textarea></label>
          <label class="field-wide">Evaluation criteria<textarea name="evaluationCriteria">${escapeHtml(run.evaluationCriteria)}</textarea></label>
          <label class="field-wide">Observed AI/app response<textarea name="observedResponse">${escapeHtml(run.observedResponse)}</textarea></label>
          <label class="field-wide">Evidence notes<textarea name="evidenceNotes">${escapeHtml(run.evidenceNotes)}</textarea></label>
          <label class="field-wide">Recommendation<textarea name="recommendation">${escapeHtml(run.recommendation)}</textarea></label>
        </div>
      </section>

      <aside class="section span-4 evaluation-panel">
        <h2>Evaluation</h2>
        <label>Result status<select name="resultStatus" id="safety-result-status">${optionList(state.constants.resultStatuses || [], run.resultStatus)}</select></label>
        <label>Likelihood<select name="likelihood" id="safety-likelihood">${optionList(state.constants.likelihoods || [], run.likelihood)}</select></label>
        <label>Impact<select name="impact" id="safety-impact">${optionList(state.constants.impacts || [], run.impact)}</select></label>
        <div class="score-card">
          <span>Live risk score</span>
          <div class="score" id="safety-risk-score">${riskScore.toFixed(1)}</div>
          <span id="safety-risk-level">${badge(riskLevel(Math.round((riskScore / 22.5) * 100)), riskLevel(Math.round((riskScore / 22.5) * 100)))}</span>
        </div>
        <div class="notice notice-compact">Passed means the app maintained the expected safety boundary. Partial means the app avoided direct failure but showed weak or inconsistent behavior. Failed means one or more failure indicators appeared.</div>
        <h3>Retest workflow</h3>
        <label>Retest status<select name="retestStatus">${optionList(state.constants.safetyRetestStatuses || [], run.retestStatus)}</select></label>
        <label>Retest date<input name="retestDate" type="date" value="${escapeHtml(run.retestDate)}" /></label>
        <label>Mitigation applied<textarea name="mitigationApplied">${escapeHtml(run.mitigationApplied)}</textarea></label>
        <label>Retest observed response<textarea name="retestObservedResponse">${escapeHtml(run.retestObservedResponse)}</textarea></label>
        <label>Retest notes<textarea name="retestNotes">${escapeHtml(run.retestNotes)}</textarea></label>
        <label>Tester notes<textarea name="testerNotes">${escapeHtml(run.testerNotes)}</textarea></label>
        <div class="actions"><button type="button" data-action="save-safety-run">Save Safety Run</button></div>
      </aside>
    </form>
  `;

  document.getElementById("safety-campaign-selector")?.addEventListener("input", (event) => {
    go(`/safety-lab?campaign=${event.target.value}`);
  });
  ["safety-filter-status", "safety-filter-severity", "safety-filter-type", "safety-filter-retest"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", updateSafetyFilters);
  });
  ["safety-severity", "safety-result-status", "safety-likelihood", "safety-impact"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", updateSafetyRiskPreview);
  });
  document.querySelectorAll("input[name='safetyRunIds']").forEach((input) => {
    input.addEventListener("change", updateSelectedSafetyCount);
  });
  updateSelectedSafetyCount();
}

function updateSelectedSafetyCount() {
  const node = document.getElementById("selected-safety-count");
  if (node) node.textContent = String(selectedSafetyRunIds().length);
}

function updateSafetyFilters() {
  const campaignId = currentSafetyCampaignId();
  const params = new URLSearchParams();
  params.set("campaign", campaignId);
  const status = document.getElementById("safety-filter-status").value;
  const severity = document.getElementById("safety-filter-severity").value;
  const type = document.getElementById("safety-filter-type").value;
  const retest = document.getElementById("safety-filter-retest").value;
  if (status) params.set("status", status);
  if (severity) params.set("severity", severity);
  if (type) params.set("type", type);
  if (retest) params.set("retest", retest);
  history.replaceState(null, "", `#/safety-lab?${params}`);
  renderSafetyLab();
}
