import { escapeHtml } from "../utils.js";
import { badge } from "./badges.js";

export function stat(label, value, hint = "") {
  return `<div class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${hint ? `<small>${escapeHtml(hint)}</small>` : ""}</div>`;
}

export function countsBy(items, field) {
  return items.reduce((acc, item) => {
    const key = item[field] || "Unspecified";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

export function chart(counts) {
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

export function detailCard(title, text) {
  return `<article class="card span-6"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></article>`;
}

export function riskMeter(score, level) {
  return `<div class="risk-meter"><span class="muted">Overall documented risk</span><div class="score">${score}</div>${badge(level, level)}<div class="meter-track"><span style="width:${Math.max(3, score)}%"></span></div><p class="muted">Only Passed, Failed, and Partial results are included in the denominator.</p></div>`;
}

