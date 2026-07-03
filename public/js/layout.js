import { pageTitle, topbarActions } from "./dom.js";
import { routeParts } from "./navigation.js";

export function setTitle(title, subtitle = "Red Team Test Library + Report Generator") {
  pageTitle.textContent = title;
  document.querySelector(".topbar .eyebrow").textContent = subtitle;
  topbarActions.innerHTML = "";
}

export function setActions(items) {
  topbarActions.innerHTML = items.join("");
}

export function activeNav() {
  const top = routeParts()[0] || "";
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const key = link.dataset.nav;
    link.classList.toggle("active", key === top || (top === "" && key === "dashboard"));
  });
}

