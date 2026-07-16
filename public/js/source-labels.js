export const sourceLabels = {
  "Test Library": "Test Library",
  "Prompt Injection Playground": "Prompt Injection Playground",
  "RAG Attack Lab": "RAG Attack Lab",
  "Jailbreak & Safety Regression Lab": "Jailbreak & Safety Regression Lab",
  Custom: "Custom"
};

export function sourceLabel(source = "Test Library") {
  return sourceLabels[source] || sourceLabels.Custom;
}

export function sourceBadgeLabel(source = "Test Library") {
  return `Source: ${sourceLabel(source)}`;
}
