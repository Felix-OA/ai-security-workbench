import { fetchJson } from "./api.js";
import { loadState } from "./state.js";
import { go } from "./navigation.js";
import { showToast } from "./toast.js";
import { render } from "./router.js";
import { renderProjectDetail } from "./render/projects.js";
import { playgroundPayload, currentPlaygroundRunId, renderPlayground } from "./render/playground.js";
import { ragPayload, currentRagRunId, renderRagLab, ragChunkCard, blankRagChunk, refreshRagChunkIndexes } from "./render/rag-lab.js";

export function attachGlobalActions() {
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
    if (action === "duplicate-scenario") {
      await fetchJson(`/api/playground/scenarios/${target.dataset.id}/duplicate`, { method: "POST" });
      showToast("Scenario duplicated");
      await loadState();
      return renderPlayground();
    }
    if (action === "delete-scenario") {
      if (!confirm("Delete this playground scenario? Saved runs will keep their recorded details.")) return;
      await fetchJson(`/api/playground/scenarios/${target.dataset.id}`, { method: "DELETE" });
      showToast("Scenario deleted");
      await loadState();
      return renderPlayground();
    }
    if (action === "scenario-to-test") {
      const test = await fetchJson(`/api/playground/scenarios/${target.dataset.id}/test-case`, { method: "POST" });
      showToast("Scenario saved as test case");
      await loadState();
      return go(`/tests/${test.id}`);
    }
    if (action === "save-current-scenario") {
      const payload = playgroundPayload();
      const scenarioId = document.getElementById("scenario-selector").value;
      const scenario = await fetchJson(scenarioId ? `/api/playground/scenarios/${scenarioId}` : "/api/playground/scenarios", {
        method: scenarioId ? "PUT" : "POST",
        body: JSON.stringify({
          name: payload.name,
          description: payload.description,
          scenarioType: payload.scenarioType,
          category: payload.category,
          owaspMapping: payload.owaspMapping,
          severity: payload.severity,
          systemPrompt: payload.systemPrompt,
          userPrompt: payload.userPrompt,
          retrievedContext: payload.retrievedContext,
          expectedSafeBehavior: payload.expectedSafeBehavior,
          failureIndicators: payload.failureIndicators,
          evaluationCriteria: payload.evaluationCriteria,
          passCondition: payload.passCondition,
          partialCondition: payload.partialCondition,
          failCondition: payload.failCondition,
          recommendedMitigation: payload.recommendedMitigation,
          tags: payload.tags
        })
      });
      showToast("Scenario saved");
      await loadState();
      return go(`/playground?scenario=${scenario.id}`);
    }
    if (action === "save-current-scenario-test") {
      const payload = playgroundPayload();
      const scenario = await fetchJson("/api/playground/scenarios", {
        method: "POST",
        body: JSON.stringify({
          name: payload.name,
          description: payload.description,
          scenarioType: payload.scenarioType,
          category: payload.category,
          owaspMapping: payload.owaspMapping,
          severity: payload.severity,
          systemPrompt: payload.systemPrompt,
          userPrompt: payload.userPrompt,
          retrievedContext: payload.retrievedContext,
          expectedSafeBehavior: payload.expectedSafeBehavior,
          failureIndicators: payload.failureIndicators,
          evaluationCriteria: payload.evaluationCriteria,
          passCondition: payload.passCondition,
          partialCondition: payload.partialCondition,
          failCondition: payload.failCondition,
          recommendedMitigation: payload.recommendedMitigation,
          tags: payload.tags
        })
      });
      const test = await fetchJson(`/api/playground/scenarios/${scenario.id}/test-case`, { method: "POST" });
      showToast("Saved as reusable test case");
      await loadState();
      return go(`/tests/${test.id}`);
    }
    if (action === "save-playground-run" || action === "save-playground-to-project") {
      const payload = playgroundPayload();
      const projectId = document.getElementById("pg-project").value;
      const existingRunId = currentPlaygroundRunId();
      const run = await fetchJson(existingRunId ? `/api/playground/runs/${existingRunId}` : "/api/playground/runs", {
        method: existingRunId ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
      if (action === "save-playground-to-project") {
        if (!projectId) {
          showToast("Choose a project first");
          return go(`/playground?run=${run.id}`);
        }
        const saved = await fetchJson(`/api/playground/runs/${run.id}/save-to-project`, {
          method: "POST",
          body: JSON.stringify({ projectId })
        });
        showToast(`Saved to ${saved.project.name}.`);
        await loadState();
        return go(`/projects/${projectId}`);
      }
      showToast("Playground run saved");
      await loadState();
      return go(`/playground?run=${run.id}`);
    }
    if (action === "add-rag-chunk") {
      const container = document.getElementById("rag-chunks");
      if (!container) return;
      if (container.querySelectorAll(".rag-chunk").length >= 5) {
        showToast("This version supports up to 5 retrieved chunks");
        return;
      }
      container.insertAdjacentHTML("beforeend", ragChunkCard(blankRagChunk(), container.querySelectorAll(".rag-chunk").length));
      refreshRagChunkIndexes();
      return;
    }
    if (action === "duplicate-rag-chunk") {
      const chunkEl = target.closest(".rag-chunk");
      const container = document.getElementById("rag-chunks");
      if (!chunkEl || !container) return;
      if (container.querySelectorAll(".rag-chunk").length >= 5) {
        showToast("This version supports up to 5 retrieved chunks");
        return;
      }
      const get = (field) => chunkEl.querySelector(`[data-field="${field}"]`);
      const duplicate = {
        id: blankRagChunk().id,
        title: `${get("title")?.value || "Untitled chunk"} copy`,
        sourceName: get("sourceName")?.value || "",
        sourceType: get("sourceType")?.value || "Help Center Article",
        trustLevel: get("trustLevel")?.value || "Unknown",
        riskLabel: get("riskLabel")?.value || "Clean",
        includeInRetrieval: Boolean(get("includeInRetrieval")?.checked),
        content: get("content")?.value || ""
      };
      chunkEl.insertAdjacentHTML("afterend", ragChunkCard(duplicate, container.querySelectorAll(".rag-chunk").length));
      refreshRagChunkIndexes();
      return;
    }
    if (action === "delete-rag-chunk") {
      const chunkEl = target.closest(".rag-chunk");
      const container = document.getElementById("rag-chunks");
      if (!chunkEl || !container) return;
      if (container.querySelectorAll(".rag-chunk").length <= 1) {
        showToast("At least one retrieved chunk is required");
        return;
      }
      if (!confirm("Delete this retrieved chunk?")) return;
      chunkEl.remove();
      refreshRagChunkIndexes();
      return;
    }
    if (action === "duplicate-rag-scenario") {
      await fetchJson(`/api/rag/scenarios/${target.dataset.id}/duplicate`, { method: "POST" });
      showToast("RAG scenario duplicated");
      await loadState();
      return renderRagLab();
    }
    if (action === "delete-rag-scenario") {
      if (!confirm("Delete this RAG scenario? Saved runs will keep their recorded details.")) return;
      await fetchJson(`/api/rag/scenarios/${target.dataset.id}`, { method: "DELETE" });
      showToast("RAG scenario deleted");
      await loadState();
      return renderRagLab();
    }
    if (action === "rag-scenario-to-test") {
      const test = await fetchJson(`/api/rag/scenarios/${target.dataset.id}/test-case`, { method: "POST" });
      showToast("RAG scenario saved as test case");
      await loadState();
      return go(`/tests/${test.id}`);
    }
    if (action === "save-current-rag-scenario") {
      const payload = ragPayload();
      const scenarioId = document.getElementById("rag-scenario-selector").value;
      const scenario = await fetchJson(scenarioId ? `/api/rag/scenarios/${scenarioId}` : "/api/rag/scenarios", {
        method: scenarioId ? "PUT" : "POST",
        body: JSON.stringify({
          name: payload.name,
          description: payload.description,
          ragRiskType: payload.ragRiskType,
          category: payload.category,
          owaspMapping: payload.owaspMapping,
          severity: payload.severity,
          systemPrompt: payload.systemPrompt,
          userQuestion: payload.userQuestion,
          retrievedChunks: payload.retrievedChunks,
          expectedSafeBehavior: payload.expectedSafeBehavior,
          failureIndicators: payload.failureIndicators,
          evaluationCriteria: payload.evaluationCriteria,
          passCondition: payload.passCondition,
          partialCondition: payload.partialCondition,
          failCondition: payload.failCondition,
          recommendedMitigation: payload.recommendedMitigation,
          tags: payload.tags
        })
      });
      showToast("RAG scenario saved");
      await loadState();
      return go(`/rag-lab?scenario=${scenario.id}`);
    }
    if (action === "save-current-rag-scenario-test") {
      const payload = ragPayload();
      const scenario = await fetchJson("/api/rag/scenarios", {
        method: "POST",
        body: JSON.stringify({
          name: payload.name,
          description: payload.description,
          ragRiskType: payload.ragRiskType,
          category: payload.category,
          owaspMapping: payload.owaspMapping,
          severity: payload.severity,
          systemPrompt: payload.systemPrompt,
          userQuestion: payload.userQuestion,
          retrievedChunks: payload.retrievedChunks,
          expectedSafeBehavior: payload.expectedSafeBehavior,
          failureIndicators: payload.failureIndicators,
          evaluationCriteria: payload.evaluationCriteria,
          passCondition: payload.passCondition,
          partialCondition: payload.partialCondition,
          failCondition: payload.failCondition,
          recommendedMitigation: payload.recommendedMitigation,
          tags: payload.tags
        })
      });
      const test = await fetchJson(`/api/rag/scenarios/${scenario.id}/test-case`, { method: "POST" });
      showToast("Saved as reusable RAG test case");
      await loadState();
      return go(`/tests/${test.id}`);
    }
    if (action === "save-rag-run" || action === "save-rag-to-project") {
      const payload = ragPayload();
      const projectId = document.getElementById("rag-project").value;
      const existingRunId = currentRagRunId();
      const run = await fetchJson(existingRunId ? `/api/rag/runs/${existingRunId}` : "/api/rag/runs", {
        method: existingRunId ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
      if (action === "save-rag-to-project") {
        if (!projectId) {
          showToast("Choose a project first");
          return go(`/rag-lab?run=${run.id}`);
        }
        const saved = await fetchJson(`/api/rag/runs/${run.id}/save-to-project`, {
          method: "POST",
          body: JSON.stringify({ projectId })
        });
        showToast(`Saved to ${saved.project.name}.`);
        await loadState();
        return go(`/projects/${projectId}`);
      }
      showToast("RAG Lab run saved");
      await loadState();
      return go(`/rag-lab?run=${run.id}`);
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
}

