// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { SearchInline, type SearchInlineHandle } from "./SearchInline";

afterEach(() => cleanup());

function mount(props: { compact?: boolean } = {}) {
  const handle = createRef<SearchInlineHandle>();
  const utils = render(<SearchInline ref={handle} target={null} compact={props.compact} />);
  return { handle, utils };
}

const inputIn = (el: HTMLElement) => el.querySelector("input") as HTMLInputElement;

describe("SearchInline focus", () => {
  it("focuses the input when the shortcut opens collapsed compact mode", () => {
    const { handle, utils } = mount({ compact: true });
    act(() => handle.current?.focus());
    expect(inputIn(utils.container)).not.toBeNull();
    expect(document.activeElement).toBe(inputIn(utils.container));
  });

  it("focuses the already-open compact input without re-rendering it", () => {
    const { handle, utils } = mount({ compact: true });
    act(() => handle.current?.focus());
    const input = inputIn(utils.container);
    input.blur();
    act(() => handle.current?.focus());
    expect(document.activeElement).toBe(input);
    expect(inputIn(utils.container)).toBe(input);
  });

  it("focuses the input in normal (non-compact) mode", () => {
    const { handle, utils } = mount();
    act(() => handle.current?.focus());
    expect(document.activeElement).toBe(inputIn(utils.container));
  });
});
