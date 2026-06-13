# Bundle Symbols Nerd Font Mono Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Nerd Font prompt icons out of the box by vendoring the symbols-only Nerd Font webfont and appending it to the default terminal font stack.

**Architecture:** Terax resolves terminal fonts the VS Code way (see `docs/ARCHITECTURE.md` section 4.8): a per-platform default stack in `src/lib/fonts.ts`, and the browser falls back per glyph through the list. We vendor `SymbolsNerdFontMono-Regular.woff2` (icon glyphs only, no text glyphs, ~1.1 MB), declare it via `@font-face`, and place it last in every default stack just before `monospace`. Icon codepoints (Private Use Area) then always resolve, with or without a user-installed Nerd Font. `ensureMonoFontsLoaded()` preloads it so the WebGL glyph atlas never rasterizes tofu on first paint.

**Tech Stack:** Vite 7 asset pipeline, CSS `@font-face`, `document.fonts.load()`, vitest.

---

## Project rules that apply to every task

- Package manager is **pnpm only**. Never npm, npx, or yarn. For one-off tools use `pnpm dlx`.
- **No em-dash characters** and **no emojis** anywhere: code, comments, commit messages, docs.
- Commit messages: short conventional style like the repo history (`feat(fonts): ...`). **Never** add "Co-Authored-By", "Generated with Claude Code", or any AI attribution.
- Comments in code: default to none. Only short comments explaining *why*.
- Lint gotcha on this machine: `pnpm lint` may get rewritten by an rtk shell hook into a broken ESLint call. Run the real linter with `pnpm exec biome lint ./src` instead. Expected output: `Lint: No issues found` (wording may vary slightly; the point is zero diagnostics).

## Background you need (do not skip)

- `src/lib/fonts.ts` exports `defaultMonoFontFamily()` which returns one of three per-platform stack constants (`MAC_STACK`, `WINDOWS_STACK`, `LINUX_STACK`). `resolveMonoFontFamily(pref)` prepends the user preference to that stack. All terminal and editor font consumers go through these two functions, so changing the three constants is the only stack change needed.
- `ensureMonoFontsLoaded()` in the same file preloads the bundled JetBrains Mono via `document.fonts.load()` and is awaited in `useTerminalSession` before a terminal first renders.
- `src/styles/fonts.css` already holds `@font-face` declarations (Inter Variable) and is imported by `src/styles/globals.css`, which both webview windows (main and settings) import. Adding a face there costs nothing until a glyph actually needs it.
- In vitest (node environment) the Tauri `platform()` call throws, so `defaultMonoFontFamily()` deterministically returns `MAC_STACK`. Tests rely on this.

---

### Task 1: Vendor the font asset and declare the @font-face

**Files:**
- Create: `src/assets/fonts/SymbolsNerdFontMono-Regular.woff2`
- Create: `src/assets/fonts/LICENSE-symbols-nerd-font.txt`
- Modify: `src/styles/fonts.css`

- [ ] **Step 1: Download and checksum-verify the official release**

```bash
mkdir -p /tmp/nf-vendor && cd /tmp/nf-vendor
curl -sLO https://github.com/ryanoasis/nerd-fonts/releases/download/v3.4.0/NerdFontsSymbolsOnly.zip
unzip -o -q NerdFontsSymbolsOnly.zip
shasum -a 256 SymbolsNerdFontMono-Regular.ttf
```

Expected: the sha256 must be exactly

```
f0f624d9b474bea1662cf7e862d44aebe1ae1f6c7f9cb7a0ca5d0e5ac9561c60
```

If it differs, STOP and report; do not continue with an unverified binary.

- [ ] **Step 2: Convert TTF to woff2**

```bash
cd /tmp/nf-vendor
pnpm dlx ttf2woff2 < SymbolsNerdFontMono-Regular.ttf > SymbolsNerdFontMono-Regular.woff2
ls -la SymbolsNerdFontMono-Regular.woff2
```

Expected: a woff2 file of roughly 1.1 MB (anything between 0.9 and 1.3 MB is fine; a file under 100 KB means the conversion failed silently, STOP and inspect). This command was verified to work on this machine on 2026-06-12.

- [ ] **Step 3: Copy the asset and its license into the repo**

```bash
mkdir -p /Users/avilches/Work/Proy/Repos/terax-ai/src/assets/fonts
cp /tmp/nf-vendor/SymbolsNerdFontMono-Regular.woff2 /Users/avilches/Work/Proy/Repos/terax-ai/src/assets/fonts/
cp /tmp/nf-vendor/LICENSE /Users/avilches/Work/Proy/Repos/terax-ai/src/assets/fonts/LICENSE-symbols-nerd-font.txt
rm -rf /tmp/nf-vendor
```

The LICENSE file from the zip is the MIT license of the nerd-fonts project; vendoring it next to the binary satisfies attribution.

- [ ] **Step 4: Declare the @font-face**

Append to the end of `src/styles/fonts.css`:

```css
/* Nerd Font icon glyphs only (PUA codepoints), vendored from nerd-fonts v3.4.0.
   Sits last in the terminal font stacks so prompt icons render without any
   user-installed Nerd Font. */
@font-face {
  font-family: 'Symbols Nerd Font Mono';
  font-style: normal;
  font-display: swap;
  src: url('../assets/fonts/SymbolsNerdFontMono-Regular.woff2') format('woff2');
}
```

Notes: no `font-weight` descriptor (single Regular face serves all weights via closest-match), and no `unicode-range` (the face is last in the stack, so it can never shadow a text font; a range would only add a silent-breakage risk if it missed a codepoint).

- [ ] **Step 5: Verify the asset resolves in a production build**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai
pnpm build
ls dist/assets | grep -i symbols
```

Expected: build succeeds and `dist/assets` contains a hashed `SymbolsNerdFontMono-Regular-<hash>.woff2`. If Vite errors with "Failed to resolve" on the url(), the relative path in Step 4 is wrong (it must be `../assets/fonts/` relative to `src/styles/`).

- [ ] **Step 6: Commit**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai
git add src/assets/fonts src/styles/fonts.css
git commit -m "feat(fonts): vendor Symbols Nerd Font Mono webfont"
```

---

### Task 2: Append the symbols font to the default stacks and preload it

**Files:**
- Modify: `src/lib/fonts.ts`
- Modify: `src/lib/fonts.test.ts`
- Modify: `docs/ARCHITECTURE.md` (section 4.8)

- [ ] **Step 1: Write the failing test**

In `src/lib/fonts.test.ts`, change the import line

```ts
import { buildFontStack, normalizeFontFamilies } from "./fonts";
```

to

```ts
import {
  buildFontStack,
  defaultMonoFontFamily,
  normalizeFontFamilies,
} from "./fonts";
```

and append this block at the end of the file:

```ts
describe("defaultMonoFontFamily", () => {
  it("ends with the bundled symbols font before the generic fallback", () => {
    expect(defaultMonoFontFamily()).toMatch(
      /"Symbols Nerd Font Mono", monospace$/,
    );
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai
pnpm exec vitest run src/lib/fonts.test.ts
```

Expected: the new `defaultMonoFontFamily` test FAILS (the stack currently ends in `"Courier New", monospace`); all other tests pass.

- [ ] **Step 3: Update the stack constants and the preload**

In `src/lib/fonts.ts`, replace the three stack constants:

```ts
const MAC_STACK =
  '"JetBrains Mono", Menlo, Monaco, "Courier New", "Symbols Nerd Font Mono", monospace';
const WINDOWS_STACK =
  '"JetBrains Mono", Consolas, "Courier New", "Symbols Nerd Font Mono", monospace';
const LINUX_STACK =
  '"JetBrains Mono", "Droid Sans Mono", "DejaVu Sans Mono", "Symbols Nerd Font Mono", monospace';
```

In the same file, inside `ensureMonoFontsLoaded()`, replace the `Promise.allSettled([...])` array so it also preloads the symbols face (the second argument is a powerline glyph; an icon font matches no default sample text, so an explicit PUA char makes the load deterministic):

```ts
  monoReady = Promise.allSettled([
    document.fonts.load('400 14px "JetBrains Mono"'),
    document.fonts.load('700 14px "JetBrains Mono"'),
    document.fonts.load('12px "Symbols Nerd Font Mono"', "\uE0B0"),
  ]).then(() => undefined);
```

Do not change anything else in the file.

- [ ] **Step 4: Run the test and verify it passes**

```bash
pnpm exec vitest run src/lib/fonts.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Update the architecture doc**

In `docs/ARCHITECTURE.md`, section `### 4.8 Terminal font resolution (VS Code model)`, replace the fragment

```
Droid Sans Mono/DejaVu Sans Mono on Linux, ending in `monospace`)
```

with

```
Droid Sans Mono/DejaVu Sans Mono on Linux, then the bundled Symbols Nerd Font Mono, ending in `monospace`)
```

and append this sentence at the end of the first paragraph of 4.8 (after "...excluded from rescaling by xterm itself)."):

```
Icon coverage does not depend on installed fonts: `src/assets/fonts/SymbolsNerdFontMono-Regular.woff2` (icon-only PUA glyphs vendored from nerd-fonts v3.4.0, ~1.1 MB, MIT) is declared in `src/styles/fonts.css`, preloaded by `ensureMonoFontsLoaded()`, and sits last in every stack, so prompt icons (powerline, devicons, octicons) render out of the box and user-set fonts inherit them through the appended default stack.
```

- [ ] **Step 6: Run the full verification suite**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai
pnpm check-types
pnpm exec biome lint ./src
pnpm exec vitest run
```

Expected: tsc clean, lint zero issues, all tests pass (137 existing + 1 new).

- [ ] **Step 7: Commit (code and docs together, repo rule)**

```bash
git add src/lib/fonts.ts src/lib/fonts.test.ts docs/ARCHITECTURE.md
git commit -m "feat(fonts): default terminal stack falls back to bundled Nerd Font symbols"
```

---

### Task 3: Verify in the running app

**Files:** none (manual verification).

- [ ] **Step 1: Launch the dev app**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai
pnpm tauri dev
```

Wait for the window to open with a terminal.

- [ ] **Step 2: Render icon glyphs in the terminal**

Type in the Terax terminal:

```bash
printf '\uE0B0 \uE718 \uF09B \uE62B \uF313\n'
```

Expected: five distinct icons (powerline triangle, nodejs, github, terminal, linux). Failure mode: hollow boxes or question marks means the face did not load; check the devtools console for a 404 on the woff2 and recheck Task 1 Step 4.

Caveat: on this development machine Nerd Fonts may already be installed, which masks the fallback. The strict check is in devtools console:

```js
document.fonts.check('12px "Symbols Nerd Font Mono"', '\uE0B0')
```

Expected: `true` after a terminal has rendered (the face is loaded and resolves the glyph).

- [ ] **Step 3: Report results**

State explicitly which checks passed (sha256, build asset, tests, lint, types, in-app glyphs) and paste the icon line output. Do not claim success without having run them.
