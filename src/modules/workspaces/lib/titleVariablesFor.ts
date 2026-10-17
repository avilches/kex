import {
  TITLE_VARIABLE_DOCS,
  type TitleSubject,
  type TitleVariableGroup,
} from "./titleTemplate";
import type { Tab } from "./types";

const VARS_FOR: Record<TitleSubject, TitleVariableGroup[]> = {
  terminal: ["common", "place", "terminal"],
  editor: ["common", "place", "file"],
  markdown: ["common", "place", "file"],
  browser: ["common", "browser"],
  "git-diff": ["common", "place", "file"],
  "git-commit-file": ["common", "place", "file"],
  "git-history": ["common", "place"],
  workspace: ["common", "place", "terminal", "file", "browser", "workspace"],
};

export type TitleVariableDoc = (typeof TITLE_VARIABLE_DOCS)[number];

// Subject first so the rename field of a markdown tab can be driven like an editor's.
export function titleSubjectForTab(kind: Tab["kind"]): TitleSubject {
  return kind === "editor" || kind === "markdown" || kind === "git-diff" || kind === "git-commit-file"
    ? "editor"
    : kind;
}

// The variables a subject can have a value for, in documentation order.
export function titleVariablesFor(subject: TitleSubject): readonly TitleVariableDoc[] {
  const groups = VARS_FOR[subject];
  return TITLE_VARIABLE_DOCS.filter((v) => groups.includes(v.group));
}

interface InputValue {
  value: string;
  start: number;
  end: number;
}

// Splices the token where a caret or selection is. Pure: the DOM wrapper carries the
// input side of the contract.
export function insertToken(into: InputValue, token: string): { value: string; caret: number } {
  const { value, start, end } = into;
  const next = value.slice(0, start) + token + value.slice(end);
  return { value: next, caret: start + token.length };
}

export function insertTitleVariable(
  input: HTMLInputElement,
  token: string,
): { value: string; caret: number } {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  const { value, caret } = insertToken({ value: input.value, start, end }, token);
  input.value = value;
  input.setSelectionRange(caret, caret);
  return { value, caret };
}
