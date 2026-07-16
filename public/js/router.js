import { app } from "./dom.js";
import { loadState } from "./state.js";
import { activeNav, setTitle } from "./layout.js";
import { routeParts } from "./navigation.js";
import { errorBox } from "./components/forms.js";
import { renderLanding, renderDashboard, renderAbout, renderNotFound } from "./render/static-pages.js";
import { renderTests, renderTestForm, renderTestDetail, renderUseInProject } from "./render/test-library.js";
import { renderPlayground } from "./render/playground.js";
import { renderRagLab } from "./render/rag-lab.js";
import { renderSafetyLab } from "./render/safety-lab.js";
import { renderProjects, renderProjectForm, renderAddTests, renderResultForm, renderProjectDashboard, renderProjectDetail } from "./render/projects.js";
import { renderReport, renderSampleReport } from "./render/reports.js";

export async function render() {
  try {
    await loadState();
    activeNav();
    const [top, id, action, subId] = routeParts();
    if (!top) return renderLanding();
    if (top === "dashboard") return renderDashboard();
    if (top === "playground") return renderPlayground();
    if (top === "rag-lab") return renderRagLab();
    if (top === "safety-lab") return renderSafetyLab();
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

export function startRouter() {
  window.addEventListener("hashchange", render);
  render();
}
