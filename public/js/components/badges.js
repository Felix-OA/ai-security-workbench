import { escapeHtml } from "../utils.js";

export function badge(value, kind = value) {
  const className = String(kind || value).toLowerCase().replaceAll(" ", "-").replaceAll("/", "").replaceAll("_", "-");
  return `<span class="badge ${className}">${escapeHtml(value)}</span>`;
}

export function tags(tags = []) {
  return `<div class="tag-row">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>`;
}

