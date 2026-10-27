// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { keepPaletteFocus } from "./lib/keepPaletteFocus";

afterEach(cleanup);

const wait = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

let setOpen: (v: boolean) => void = () => {};

function Page({ guarded }: { guarded: boolean }) {
  const [open, set] = useState(false);
  setOpen = set;
  return (
    <>
      <input cmdk-input="" data-palette="command" data-testid="palette-input" />
      <AlertDialog open={open}>
        <AlertDialogContent onCloseAutoFocus={guarded ? keepPaletteFocus : undefined}>
          <AlertDialogTitle>Hibernate tab?</AlertDialogTitle>
          <button type="button" autoFocus>Hibernate now</button>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

async function openThenClose(guarded: boolean) {
  const { getByTestId } = render(<Page guarded={guarded} />);
  const input = getByTestId("palette-input") as HTMLInputElement;
  input.focus();
  await act(async () => setOpen(true));
  await wait(50);
  expect(document.activeElement).not.toBe(input);
  await act(async () => setOpen(false));
  await wait(400);
  return input;
}

describe("focus after the hibernate review dialog closes over the palette", () => {
  it("returns to the palette input when the dialog unmounts", async () => {
    const input = await openThenClose(true);
    expect(document.activeElement).toBe(input);
  });

  it("is lost to the page without the close handler, which is what the dialog does on its own", async () => {
    const input = await openThenClose(false);
    expect(document.activeElement).not.toBe(input);
  });
});
