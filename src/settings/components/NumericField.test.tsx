// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NumericField } from "./NumericField";

afterEach(() => cleanup());

function mount(props: {
  value: number;
  clamp?: (n: number) => number;
  onCommit: (n: number) => void;
}) {
  const utils = render(
    <NumericField
      value={props.value}
      min={0}
      max={999}
      clamp={props.clamp}
      onCommit={props.onCommit}
    />,
  );
  const input = utils.container.querySelector("input") as HTMLInputElement;
  return { input, utils };
}

describe("NumericField commit semantics", () => {
  it("commits the typed value on blur", () => {
    const onCommit = vi.fn();
    const { input } = mount({ value: 4, onCommit });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(7);
    expect(input.value).toBe("7");
  });

  it("does not commit or write when cleared, and reverts on blur", () => {
    const onCommit = vi.fn();
    const { input } = mount({ value: 4, onCommit });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe("4");
  });

  it("commits the clamped value for out-of-range input", () => {
    const onCommit = vi.fn();
    const { input } = mount({
      value: 4,
      clamp: (n: number) => Math.min(n, 8),
      onCommit,
    });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "50" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(8);
    expect(input.value).toBe("8");
  });

  it("does not commit when the clamped value equals the current one", () => {
    const onCommit = vi.fn();
    const { input } = mount({
      value: 4,
      clamp: (n: number) => Math.min(n, 4),
      onCommit,
    });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe("4");
  });
});
