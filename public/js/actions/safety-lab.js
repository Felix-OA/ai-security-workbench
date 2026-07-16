import { fetchJson } from "../api.js";
import { loadState } from "../state.js";
import { go } from "../navigation.js";
import { showToast } from "../toast.js";
import {
  currentSafetyCampaignId,
  currentSafetyRunId,
  renderSafetyLab,
  safetyCampaignPayload,
  safetyRunPayload,
  selectedSafetyRunIds
} from "../render/safety-lab.js";

export async function handleSafetyAction(action) {
  if (action === "save-safety-campaign") {
    const form = document.getElementById("safety-campaign-form");
    if (form && !form.reportValidity()) {
      showToast("Complete the required campaign fields and confirm authorization.");
      return true;
    }
    const payload = safetyCampaignPayload();
    const campaignId = payload.id || "";
    const saved = await fetchJson(campaignId ? `/api/safety/campaigns/${campaignId}` : "/api/safety/campaigns", {
      method: campaignId ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    showToast("Safety campaign saved");
    await loadState();
    go(`/safety-lab?campaign=${saved.id}`);
    return true;
  }

  if (action === "add-safety-template-run") {
    const campaignId = currentSafetyCampaignId();
    const templateId = document.getElementById("safety-template-picker")?.value || "";
    if (!campaignId) {
      showToast("Create or load a campaign first");
      return true;
    }
    if (!templateId) {
      showToast("Choose a safety template first");
      return true;
    }
    const run = await fetchJson(`/api/safety/campaigns/${campaignId}/runs/from-template`, {
      method: "POST",
      body: JSON.stringify({ templateId })
    });
    showToast("Safety test added");
    await loadState();
    go(`/safety-lab?campaign=${campaignId}&run=${run.id}`);
    return true;
  }

  if (action === "save-safety-run") {
    const form = document.getElementById("safety-run-form");
    if (form && !form.reportValidity()) {
      showToast("Complete the required safety test fields before saving.");
      return true;
    }
    const payload = safetyRunPayload();
    if (["Passed", "Failed", "Partial"].includes(payload.resultStatus) && !String(payload.observedResponse || "").trim()) {
      showToast("Paste the observed AI/app response before marking this run Passed, Partial, or Failed.");
      return true;
    }
    const existingRunId = currentSafetyRunId();
    const run = await fetchJson(existingRunId ? `/api/safety/runs/${existingRunId}` : "/api/safety/runs", {
      method: existingRunId ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    showToast("Safety run saved");
    await loadState();
    go(`/safety-lab?campaign=${run.campaignId}&run=${run.id}`);
    return true;
  }

  if (action === "save-selected-safety-findings" || action === "save-safety-findings" || action === "save-safety-completed") {
    const campaignId = currentSafetyCampaignId();
    const projectId = document.getElementById("safety-project")?.value || "";
    const selectedRunIds = action === "save-selected-safety-findings" ? selectedSafetyRunIds() : [];
    if (!campaignId) {
      showToast("Load a campaign first");
      return true;
    }
    if (!projectId) {
      showToast("Choose a project before saving Safety Lab findings.");
      return true;
    }
    if (action === "save-selected-safety-findings" && selectedRunIds.length === 0) {
      showToast("Select at least one completed Safety Lab run to save.");
      return true;
    }
    const result = await fetchJson(`/api/safety/campaigns/${campaignId}/save-to-project`, {
      method: "POST",
      body: JSON.stringify({
        projectId,
        mode: action === "save-safety-completed" || action === "save-selected-safety-findings" ? "completed" : "findings",
        selectedRunIds
      })
    });
    showToast(`Saved ${result.saved.length} Safety Lab finding${result.saved.length === 1 ? "" : "s"} to project`);
    await loadState();
    renderSafetyLab();
    return true;
  }

  return false;
}
