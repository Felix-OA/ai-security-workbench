export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function rowsFromForm(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  form.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    data[input.name] = input.checked;
  });
  return data;
}

export function inlineMarkdown(value) {
  return escapeHtml(value).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

export function splitMarkdownTableRow(row) {
  const cells = [];
  let cell = "";
  let escaped = false;
  for (const char of row) {
    if (escaped) {
      cell += char === "|" ? "|" : `\\${char}`;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "|") {
      cells.push(cell);
      cell = "";
      continue;
    }
    cell += char;
  }
  if (escaped) cell += "\\";
  cells.push(cell);
  return cells.slice(1, -1);
}

export function markdownToHtml(markdown) {
  const lines = markdown.split("\n");
  let html = "";
  let inList = false;
  let tableRows = [];
  let inCodeFence = false;
  let codeFence = "";
  let codeLines = [];
  const flushList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };
  const flushCode = () => {
    if (inCodeFence) {
      html += `<pre class="code-block"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`;
      inCodeFence = false;
      codeFence = "";
      codeLines = [];
    }
  };
  const flushTable = () => {
    if (!tableRows.length) return;
    const [header, separator, ...body] = tableRows;
    const cells = (row) => splitMarkdownTableRow(row).map((cell) => inlineMarkdown(cell.trim()));
    html += `<div class="table-wrap report-table"><table><thead><tr>${cells(header).map((cell) => `<th>${cell}</th>`).join("")}</tr></thead><tbody>${body
      .filter((row) => row !== separator)
      .map((row) => `<tr>${cells(row).map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></div>`;
    tableRows = [];
  };

  lines.forEach((line) => {
    const fenceMatch = line.match(/^(`{3,})(?:text|markdown|md|json|[a-z0-9_-]+)?\s*$/i);
    if (inCodeFence) {
      if (fenceMatch && fenceMatch[1].length >= codeFence.length) {
        flushCode();
      } else {
        codeLines.push(line);
      }
      return;
    }
    if (fenceMatch) {
      flushList();
      flushTable();
      inCodeFence = true;
      codeFence = fenceMatch[1];
      codeLines = [];
      return;
    }
    if (line.trim().startsWith("|")) {
      flushList();
      tableRows.push(line);
      return;
    }
    flushTable();
    if (line.startsWith("# ")) {
      flushList();
      html += `<h1>${inlineMarkdown(line.slice(2))}</h1>`;
    } else if (line.startsWith("## ")) {
      flushList();
      html += `<h2>${inlineMarkdown(line.slice(3))}</h2>`;
    } else if (line.startsWith("### ")) {
      flushList();
      html += `<h3>${inlineMarkdown(line.slice(4))}</h3>`;
    } else if (line.startsWith("* ")) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inlineMarkdown(line.slice(2))}</li>`;
    } else if (line.startsWith("- ")) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inlineMarkdown(line.slice(2))}</li>`;
    } else if (line.startsWith("> ")) {
      flushList();
      html += `<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`;
    } else if (line.trim()) {
      flushList();
      html += `<p>${inlineMarkdown(line)}</p>`;
    }
  });
  flushList();
  flushTable();
  flushCode();
  return html;
}
