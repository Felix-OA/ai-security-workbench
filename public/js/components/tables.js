import { escapeHtml } from "../utils.js";

export function table(headers, rows, emptyText = "No records yet.") {
  if (!rows.length) return `<div class="empty">${escapeHtml(emptyText)}</div>`;
  return `<div class="table-wrap"><table><thead><tr>${headers.map((head) => `<th>${escapeHtml(head)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

