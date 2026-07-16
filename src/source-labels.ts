import type { TestResult } from "./store.js";

export const sourceLabels: Record<TestResult["source"], TestResult["source"]> = {
  "Test Library": "Test Library",
  "Prompt Injection Playground": "Prompt Injection Playground",
  "RAG Attack Lab": "RAG Attack Lab",
  "Jailbreak & Safety Regression Lab": "Jailbreak & Safety Regression Lab",
  Custom: "Custom"
};

export const sourceValues = Object.keys(sourceLabels) as TestResult["source"][];

export function sourceLabel(source: string | undefined): TestResult["source"] {
  return source && source in sourceLabels ? (source as TestResult["source"]) : "Custom";
}

export function sourceLine(source: string | undefined) {
  return `Source: ${sourceLabel(source)}`;
}
