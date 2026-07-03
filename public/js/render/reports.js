import { app } from "../dom.js";
import { fetchJson } from "../api.js";
import { setTitle, setActions } from "../layout.js";
import { escapeHtml, markdownToHtml } from "../utils.js";
import { getProject } from "./projects.js";

export async function renderReport(projectId) {
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

export async function renderSampleReport() {
  await renderReport("sample-project");
}

