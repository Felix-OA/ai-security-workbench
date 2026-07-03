import { escapeHtml } from "../utils.js";

export function optionList(values, selected = "") {
  return values.map((value) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
}

export function errorBox(error) {
  return `<div class="error">${escapeHtml(error.message || error)}</div>`;
}

