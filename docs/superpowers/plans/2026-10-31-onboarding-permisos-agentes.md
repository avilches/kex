# Onboarding, permisos de disco y estados de integracion de agentes: plan de implementacion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un onboarding de primera vez con "seguir mas tarde", una seccion de permisos de disco en Settings, y filas de agentes con estado real de deteccion mas "Install all" y "Uninstall all".

**Architecture:** La logica va en funciones puras (estado de fila, estado del onboarding, clasificacion de permisos, plan de sincronizacion del arranque) con pruebas unitarias; los comandos de Tauri y los componentes quedan finos. Los componentes de lista de permisos y de filas de agentes se comparten entre el modal del onboarding (ventana principal) y Settings (otra webview). El estado del onboarding se guarda en `settings-general.json` con el mismo patron de cola que `integrationSuggestions`.

**Tech Stack:** Tauri 2 + Rust, React 19 + TypeScript, zustand, vitest (+ happy-dom en componentes), shadcn/ui, hugeicons. Solo `pnpm`.

**Spec:** `docs/superpowers/specs/2026-10-31-onboarding-permisos-agentes-design.md`

## Global Constraints

- Sin em-dash ni emojis en codigo, comentarios, commits ni docs.
- Mensajes de commit en ingles, una linea, sin `Co-Authored-By` ni marca de Claude (regla del usuario, gana al aviso del arnes).
- Comentarios: por defecto ninguno; si hace falta, 1-2 lineas sobre el por que.
- Imports del frontend siempre `@/...`.
- Sin codigo de migracion ni compatibilidad hacia atras.
- Controles siempre de shadcn; los `<input>` usan `INPUT_CLASS` (`docs/SETTINGS_UI.md`).
- Nunca hardcodear atajos de teclado.
- Los comandos de Tauri nuevos se documentan en `docs/IPC.md` en el mismo commit.
- El paso de permisos y la seccion Permissions solo existen en macOS (`IS_MAC` de `@/lib/platform`).
- Estados de fila de agente: "No detectado", "Sin integracion", "Integracion instalada" y un cuarto de aviso (`malformed`/`uneditable`/`unavailable`).
- La sincronizacion del arranque exige a la vez agente detectado e integracion instalada, y nunca instala.
- Checks antes de dar algo por hecho: `pnpm lint`, `pnpm check-types`, `pnpm test`, `cd src-tauri && cargo clippy && cargo test --locked`.

## Review Focus

1. `onboarding` guardado pero malformado (por ejemplo una cadena) con ajustes previos presentes: se trata como terminado y en silencio, nunca como primera vez.
2. Claude Code no instalado con `agentNotifications` en `true`: el arranque no crea `~/.claude/` ni escribe nada.
3. Carpeta que no existe (iCloud Drive ausente): sale `unavailable`, nunca `denied`.
4. "Install all" con una mezcla (uno falla, otro esta en aviso, otro no detectado): los demas siguen, el resultado lista cada grupo.
5. Windows y Linux: el onboarding salta el paso de permisos y no hay seccion Permissions; Codex en Windows (`unavailable`) lo salta Install all.

---

## File Structure

- Create `src-tauri/src/modules/permissions.rs`: sondeo de acceso a carpetas y apertura del panel de Privacidad.
- Modify `src-tauri/src/modules/mod.rs`, `src-tauri/src/lib.rs`: registrar modulo y comandos.
- Modify `src-tauri/Info.plist`, `src-tauri/entitlements.plist`: quitar camara y microfono, anadir textos de carpetas.
- Create `src/modules/agents/lib/agentRows.ts` (+ test): catalogo de agentes conocidos y estado de fila.
- Create `src/modules/agents/lib/bulkIntegration.ts` (+ test): plan y ejecucion de Install all / Uninstall all.
- Create `src/modules/agents/lib/startupSync.ts` (+ test): que sincroniza el arranque.
- Modify `src/modules/agents/lib/agentIntegration.ts`: guarda de deteccion en `installAgent`.
- Modify `src/modules/agents/lib/integrationSuggestionFlow.ts`: dependencia `suppressed`.
- Modify `src/main.tsx`: usar `startupSync`.
- Create `src/modules/onboarding/lib/onboardingState.ts` (+ test): estado puro.
- Modify `src/modules/settings/store.ts`, `preferences.ts`: clave `onboarding`.
- Create `src/modules/permissions/lib/permissions.ts` (+ test), `PermissionsList.tsx` (+ test).
- Modify `src/lib/native.ts`: envoltorios `permissionProbe` y `permissionOpenSettings`.
- Create `src/settings/sections/PermissionsSection.tsx`; modify `sections.ts`, `sections.test.ts`, `openSettingsWindow.ts`, `SettingsApp.tsx`.
- Create `src/settings/sections/AgentStatusRow.tsx`; modify `AgentIntegrations.tsx`, `AgentIntegrationRow.tsx`.
- Create `src/modules/onboarding/` (`OnboardingHost.tsx`, `OnboardingDialog.tsx`, `OnboardingChip.tsx`, pasos); modify `src/app/App.tsx`, `src/modules/header/Header.tsx`.
- Modify `docs/IPC.md`, `docs/NOTIFICATIONS.md`, `docs/SETTINGS_UI.md`, `docs/ARCHITECTURE.md`, `docs/FORK.md`, y el spec (guarda de instalacion).

---

### Task 1: Comandos de permisos en Rust

**Files:**
- Create: `src-tauri/src/modules/permissions.rs`
- Modify: `src-tauri/src/modules/mod.rs` (anadir `pub mod permissions;`), `src-tauri/src/lib.rs` (registrar en `invoke_handler`), `docs/IPC.md`

**Interfaces:**
- Produces (Rust): `enum PermissionKind { Desktop, Documents, Downloads, Icloud, FullDisk }` y `enum ProbeState { Granted, Denied, Unavailable }`, ambos con `#[serde(rename_all = "camelCase")]`; `fn classify_read(result: &std::io::Result<()>) -> ProbeState`; `fn probe_path(kind: PermissionKind, home: &Path) -> PathBuf`; `fn settings_url(kind: PermissionKind) -> &'static str`.
- Produces (IPC): `permission_probe(kind) -> Result<ProbeState, String>` (async, `spawn_blocking`; fuera de macOS devuelve `Unavailable`) y `permission_open_settings(kind) -> Result<(), String>` (macOS: `open <url>`; otras plataformas: error).

- [ ] **Step 1: Escribir las pruebas** en un `mod tests` de `permissions.rs`:
  - `classify_read_maps_permission_denied_to_denied` con `Err(io::Error::from(ErrorKind::PermissionDenied))` y con `io::Error::from_raw_os_error(1)` (EPERM, lo que devuelve macOS TCC) ambos a `Denied`.
  - `classify_read_maps_ok_to_granted`, `classify_read_maps_not_found_to_unavailable`, y `classify_read_maps_other_errors_to_unavailable` (`ErrorKind::Other`).
  - `probe_path_per_kind` con `home = /Users/x`: `/Users/x/Desktop`, `/Users/x/Documents`, `/Users/x/Downloads`, `/Users/x/Library/Mobile Documents/com~apple~CloudDocs`, `/Users/x/Library/Safari` (FullDisk).
  - `settings_url_per_kind`: `x-apple.systempreferences:com.apple.preference.security?Privacy_DesktopFolder`, `..._DocumentsFolder`, `..._DownloadsFolder`, `Privacy_FilesAndFolders` para iCloud y `Privacy_AllFiles` para FullDisk.
  - `permission_kind_deserializes_camel_case` con `"fullDisk"` y `"icloud"`.
- [ ] **Step 2: Ejecutar y ver que falla**: `cd src-tauri && cargo test --locked permissions` -> error de compilacion o FAIL.
- [ ] **Step 3: Implementar** las firmas de Interfaces. El sondeo es `std::fs::read_dir(path).map(|_| ())` pasado a `classify_read`; no lee contenido. Comentar en 1 linea que leer una carpeta sin decidir dispara el aviso del sistema.
- [ ] **Step 4: Registrar** el modulo y los dos comandos; anadir dos filas a `docs/IPC.md` (descripcion: que hace cada uno, que sondear una carpeta sin decidir muestra el aviso de macOS y que denegado solo se arregla en el panel).
- [ ] **Step 5: Verificar**: `cd src-tauri && cargo test --locked permissions && cargo clippy` -> PASS, sin avisos.
- [ ] **Step 6: Commit**: `git add src-tauri docs/IPC.md && git commit -m "Add permission probe and Privacy pane commands"`

---

### Task 2: Info.plist y entitlements

**Files:**
- Modify: `src-tauri/Info.plist`, `src-tauri/entitlements.plist`

**Interfaces:** ninguna.

- [ ] **Step 1: Editar `Info.plist`**: quitar `NSCameraUsageDescription` y `NSMicrophoneUsageDescription`; anadir `NSDesktopFolderUsageDescription`, `NSDocumentsFolderUsageDescription` y `NSDownloadsFolderUsageDescription` con un texto de una frase que diga que los terminales y agentes de Kex necesitan leer esa carpeta. Sin la palabra Terax.
- [ ] **Step 2: Editar `entitlements.plist`**: quitar las claves de camara y microfono; si el diccionario queda vacio dejar `<dict/>` (el fichero lo referencia `tauri.conf.json`).
- [ ] **Step 3: Verificar**: `plutil -lint src-tauri/Info.plist src-tauri/entitlements.plist` -> `OK` en ambos; `grep -rn "Camera\|Microphone\|camera\|microphone" src-tauri/Info.plist src-tauri/entitlements.plist` -> sin resultados.
- [ ] **Step 4: Commit**: `git commit -am "Drop camera and microphone entitlements, add folder usage texts"`

---

### Task 3: Catalogo de agentes y estado de fila (puro)

**Files:**
- Create: `src/modules/agents/lib/agentRows.ts`, `src/modules/agents/lib/agentRows.test.ts`

**Interfaces:**
- Consumes: `AgentId`, `IntegrationStatus`, `IntegrationBlock`, `blockOf` de `./integrations`; `DetectedEditor` de `@/modules/external-editors/types`.
- Produces:
  - `type KnownAgent = { id: string; name: string; integration: AgentId | null }` y `KNOWN_AGENTS: readonly KnownAgent[]` con los once: `claude`, `codex`, `opencode`, `omp`, `pi` (con `integration` igual a su id y nombres de `AGENT_LABELS`) y `agy` (Antigravity), `openclaude` (OpenClaude), `grok` (Grok), `aider` (Aider), `goose` (Goose), `cursor-agent` (Cursor Agent) con `integration: null`.
  - `detectedAgentIds(editors: readonly DetectedEditor[]): Set<string>`: ids de entradas con `kind === "agent"`, ignorando `enabled`.
  - `type RowState = { kind: "checking" } | { kind: "notDetected" } | { kind: "detectedOnly" } | { kind: "missing" } | { kind: "installed" } | { kind: "blocked"; block: IntegrationBlock }`
  - `rowStateOf(input: { detected: boolean; hasIntegration: boolean; status: IntegrationStatus | null }): RowState`.

- [ ] **Step 1: Escribir pruebas** (`describe("rowStateOf")`): `not detected wins over any status` (detected=false con status `installed` -> `notDetected`); `detected without integration is detectedOnly`; `status null while detected is checking`; `missing`, `installed`; `malformed`, `uneditable` y `unavailable` -> `{kind:"blocked", block}`. `detectedAgentIds`: `keeps only agents` (mezcla editor y agent) y `ignores enabled false`. `KNOWN_AGENTS`: `lists eleven agents once each` y `only the five integrable ones carry an integration id`.
- [ ] **Step 2: Ejecutar**: `pnpm vitest run src/modules/agents/lib/agentRows.test.ts` -> FAIL (modulo inexistente).
- [ ] **Step 3: Implementar** las firmas de Interfaces.
- [ ] **Step 4: Ejecutar** -> PASS.
- [ ] **Step 5: Commit**: `git add src/modules/agents/lib && git commit -m "Add known agents catalog and agent row state"`

---

### Task 4: Guarda de instalacion, Install all / Uninstall all y sincronizacion del arranque

**Files:**
- Create: `src/modules/agents/lib/bulkIntegration.ts` (+ `.test.ts`), `src/modules/agents/lib/startupSync.ts` (+ `.test.ts`)
- Modify: `src/modules/agents/lib/agentIntegration.ts`, `src/modules/agents/lib/agentIntegration.test.ts`, `src/main.tsx`, y la linea del spec sobre "el comando de instalacion rechaza" (pasa a decir que la guarda vive en `installAgent`, el unico camino de instalacion)

**Interfaces:**
- Consumes: `RowState` de Task 3; `usePreferencesStore` (`detectedEditors`, `installedIntegrations`, `agentNotifications`).
- Produces:
  - `class AgentNotDetectedError extends Error` y `assertDetected(agent: AgentId, detected: ReadonlySet<string>): void` (lanza `AgentNotDetectedError`) en `agentIntegration.ts`; `installAgent` lee `detectedAgentIds(usePreferencesStore.getState().detectedEditors)` y llama a `assertDetected` antes de escribir nada.
  - `planBulk(kind: "install" | "remove", states: Partial<Record<AgentId, RowState>>): AgentId[]`: install -> agentes en `missing`; remove -> en `installed`; el resto fuera.
  - `type BulkResult = { done: AgentId[]; failed: AgentId[]; skipped: AgentId[] }` y `runBulk(kind, states, run: (agent: AgentId) => Promise<void>): Promise<BulkResult>`: ejecuta en serie los de `planBulk`, un fallo no corta, `skipped` = los demas.
  - `syncPlan(input: { detected: ReadonlySet<string>; installed: readonly IntegrationAgent[]; claudeHooksInstalled: boolean; agentNotifications: boolean }): { claude: "refresh" | "disable" | "none"; others: IntegrationAgent[] }`: `claude` es `refresh` solo si detectado, hooks instalados y notificaciones activas; `disable` si detectado, notificaciones apagadas y hooks instalados; si no, `none`. `others` = los de `installed` que estan detectados.

- [ ] **Step 1: Pruebas** `assertDetected throws for an agent that is not detected` y `installAgent writes nothing when the agent is not detected` (mock de `invoke`: no se llama); `planBulk` (`install only picks missing`, `remove only picks installed`, `ignores blocked, notDetected and detectedOnly`); `runBulk` (`continues after a failure and reports it`, `reports skipped agents`); `syncPlan` (`claude not detected does nothing even with notifications on` [Review Focus 2], `claude detected with hooks installed refreshes`, `claude detected with hooks missing does nothing`, `others keeps only detected installed integrations`, `empty detected set syncs nothing`).
- [ ] **Step 2: Ejecutar** -> FAIL.
- [ ] **Step 3: Implementar** las firmas. En `main.tsx` sustituir el bloque de sincronizacion por: leer `agent_claude_hooks_status` solo si Claude esta detectado, calcular `syncPlan` con `startupPrefs.detectedEditors`, y ejecutar `agent_enable_claude_hooks({refresh:false})` / `agent_disable_claude_hooks` / `syncIntegrations(plan.others, ...)` segun el plan. Todo con `.catch(() => {})` como hoy.
- [ ] **Step 4: Ejecutar** `pnpm vitest run src/modules/agents` y `pnpm check-types` -> PASS.
- [ ] **Step 5: Commit**: `git add -A src docs && git commit -m "Gate installs and startup sync on agent detection, add bulk plan"`

---

### Task 5: Estado del onboarding (puro) y persistencia

**Files:**
- Create: `src/modules/onboarding/lib/onboardingState.ts`, `onboardingState.test.ts`
- Modify: `src/modules/settings/store.ts`, `src/modules/settings/preferences.ts`, `src/modules/settings/store.test.ts`

**Interfaces:**
- Produces (en `onboardingState.ts`):
  - `ONBOARDING_STEPS = ["welcome", "style", "permissions", "agents", "done"] as const`, `type OnboardingStep`.
  - `type OnboardingState = { finished: boolean; step: OnboardingStep; shown: boolean; reminded: boolean }`.
  - `parseOnboarding(raw: unknown, hadStoredPrefs: boolean): OnboardingState`: sin `raw` y sin ajustes previos -> `{finished:false, step:"welcome", shown:false, reminded:false}`; sin `raw` pero con ajustes previos -> terminado; `raw` malformado con ajustes previos -> terminado; `raw` valido -> lo que diga, con `step` desconocido cayendo a `"welcome"`.
  - `visibleSteps(isMac: boolean): OnboardingStep[]` (sin `permissions` si no es macOS), `stepAfter(step, isMac)`, `stepBefore(step, isMac)` (se quedan en el borde), `withStep`, `withShown`, `withReminded`, `finish(state)`.
  - `startupAction(state: OnboardingState): "openModal" | "remind" | "none"`: `!finished && !shown` -> `openModal`; `!finished && shown && !reminded` -> `remind`; si no, `none`.
  - `suppressIntegrationToast(state): boolean` (`!finished`), `showChip(state): boolean` (`!finished && shown`), `chipLabel(state, isMac): string` (`"Finish setup 3/5"` con indice dentro de `visibleSteps`).
  - `STYLE_PRESETS: Record<"vscode" | "jetbrains", { explorerGitColorScheme: "vscode" | "jetbrains"; previewOnClick: boolean }>` (`vscode` -> true, `jetbrains` -> false).
- Produces (store): clave `KEY_ONBOARDING = "onboarding"`, campo `Preferences.onboarding: OnboardingState` (por defecto `finished: true` para que nada parpadee antes de cargar), `updateOnboarding(change: (s: OnboardingState) => OnboardingState): Promise<void>` con cola de promesas igual que `updateIntegrationSuggestions`, entrada en `GENERAL_PREF_KEY_MAP`. En `loadPreferences`, `hadStoredPrefs = entries.length > 0` se calcula antes de persistir los valores por defecto.

- [ ] **Step 1: Pruebas** de `onboardingState`: las cinco ramas de `parseOnboarding` [Review Focus 1], `visibleSteps hides permissions outside macOS`, `stepAfter skips permissions outside macOS`, `startupAction` (tres casos), `suppressIntegrationToast`, `showChip is false before the modal was ever shown`, `chipLabel counts only visible steps`, `STYLE_PRESETS`. En `store.test.ts`: `a fresh store loads onboarding as not finished` y `a store with prior keys loads it as finished` (siguiendo el mock de `LazyStore` que ya usa el fichero).
- [ ] **Step 2: Ejecutar** `pnpm vitest run src/modules/onboarding src/modules/settings` -> FAIL.
- [ ] **Step 3: Implementar** firmas y cableado del store.
- [ ] **Step 4: Ejecutar** -> PASS, mas `pnpm check-types`.
- [ ] **Step 5: Verificacion manual** (anotar el resultado en el mensaje del commit no hace falta): borrar el `settings-general.json` del build de desarrollo (`docs/USER_DATA.md` dice donde), arrancar con `pnpm tauri dev` y comprobar con un `console` de la webview o un log que `onboarding.finished` es `false`; arrancar otra vez y comprobar que sigue habiendo `onboarding` guardado. Esto cubre que nada escribe el fichero antes de `loadPreferences`.
- [ ] **Step 6: Commit**: `git add -A src && git commit -m "Add onboarding state and its persistence"`

---

### Task 6: Cliente y lista de permisos

**Files:**
- Create: `src/modules/permissions/lib/permissions.ts`, `permissions.test.ts`, `src/modules/permissions/PermissionsList.tsx`, `PermissionsList.test.tsx`, `src/modules/permissions/index.ts`
- Modify: `src/lib/native.ts`

**Interfaces:**
- Consumes: comandos de Task 1.
- Produces:
  - `PERMISSION_KINDS = ["desktop","documents","downloads","icloud","fullDisk"] as const`, `type PermissionKind`, `type ProbeState = "granted" | "denied" | "unavailable"`, `type PermissionRow = "unchecked" | "checking" | ProbeState`.
  - `PERMISSION_LABELS: Record<PermissionKind, string>` ("Desktop", "Documents", "Downloads", "iCloud Drive", "Full Disk Access").
  - `permissionAction(row: PermissionRow): "check" | "openSettings" | "none"` (`unchecked` -> check, `denied` -> openSettings, el resto none).
  - `summarizePermissions(rows: Record<PermissionKind, PermissionRow>): { granted: number; denied: number; unchecked: number }` (`unavailable` no cuenta).
  - En `native.ts`: `permissionProbe(kind): Promise<ProbeState>` y `permissionOpenSettings(kind): Promise<void>`.
  - `<PermissionsList compact?: boolean />`: lista las filas, boton "Check all", y por fila "Check" o "Open System Settings" segun `permissionAction`; un texto bajo la lista avisa de que comprobar uno sin decidir puede mostrar el dialogo del sistema y de que macOS no deja pedir de nuevo uno denegado. Las filas `unavailable` se muestran atenuadas con "Not present".

- [ ] **Step 1: Pruebas** de las funciones puras (los tres `permissionAction`, `summarizePermissions ignores unavailable`) y del componente (happy-dom, `native` mockeado): `check all probes every kind and shows the result`, `a denied row offers Open System Settings and calls permissionOpenSettings with its kind`, `an unavailable row is dimmed and offers nothing` [Review Focus 3].
- [ ] **Step 2: Ejecutar** `pnpm vitest run src/modules/permissions` -> FAIL.
- [ ] **Step 3: Implementar**. El estado de las filas es local al componente (`useState`); las comprobaciones se lanzan en paralelo.
- [ ] **Step 4: Ejecutar** -> PASS y `pnpm check-types`.
- [ ] **Step 5: Commit**: `git add -A src && git commit -m "Add permissions client and list component"`

---

### Task 7: Seccion Permissions en Settings

**Files:**
- Create: `src/settings/sections/PermissionsSection.tsx`
- Modify: `src/modules/settings/sections.ts`, `sections.test.ts`, `src/modules/settings/openSettingsWindow.ts`, `src/settings/SettingsApp.tsx`, `docs/SETTINGS_UI.md`

**Interfaces:**
- Consumes: `PermissionsList` de Task 6, `IS_MAC`.
- Produces: `SettingsSection` gana `"permissions"`; `SettingsSectionMeta` gana `macOnly?: true`; `SETTINGS_SECTIONS` incluye `{ id: "permissions", label: "Permissions", icon, macOnly: true }` justo despues de `agents` (icono de hugeicons que exista en `@hugeicons/core-free-icons`, comprobar que compila); `SettingsApp` filtra las `macOnly` fuera de macOS y `parseSectionParam` cae a `general` si piden `permissions` fuera de macOS.

- [ ] **Step 1: Pruebas**: actualizar `sections.test.ts` (once secciones, `permissions` tras `agents`, `permissions is the only macOnly section`); anadir en `sectionParam.test.tsx` `permissions falls back to general outside macOS` (mock de `IS_MAC`).
- [ ] **Step 2: Ejecutar** `pnpm vitest run src/modules/settings src/settings` -> FAIL.
- [ ] **Step 3: Implementar**: seccion con `SectionHeader title="Permissions"` y `<PermissionsList />`; registrar en `COMPONENTS`; documentar la seccion en `docs/SETTINGS_UI.md`.
- [ ] **Step 4: Ejecutar** -> PASS, `pnpm check-types`, `pnpm lint`.
- [ ] **Step 5: Commit**: `git add -A src docs && git commit -m "Add the Permissions section to Settings"`

---

### Task 8: Filas de agentes con estados reales e Install all

**Files:**
- Create: `src/settings/sections/AgentStatusRow.tsx`, `AgentStatusRow.test.tsx`
- Modify: `src/settings/sections/AgentIntegrations.tsx`, `AgentIntegrationRow.tsx`, `AgentIntegrationRow.test.tsx`

**Interfaces:**
- Consumes: `KNOWN_AGENTS`, `detectedAgentIds`, `rowStateOf` (Task 3); `planBulk`, `runBulk` (Task 4); `useIntegration`.
- Produces: `useDetectedAgentIds(): ReadonlySet<string>` en `src/modules/agents/lib/useDetectedAgents.ts` (memoizado sobre `usePreferencesStore((s) => s.detectedEditors)`); `<AgentStatusRow agent={KnownAgent} state={"notDetected" | "detectedOnly"} />` para los agentes sin integracion o no detectados (icono, nombre, "Not detected" / "Detected"); `AgentIntegrationRow` gana la prop `detected: boolean` y cuando es `false` se comporta como `AgentStatusRow` (sin botones, sin Preview, texto "Not detected" con una linea de como conseguir el agente). Los botones "Install all" y "Uninstall all" van sobre la lista; "Uninstall all" abre un `AlertDialog` con la lista de agentes afectados (`planBulk("remove", ...)`) y "Install all" ejecuta `runBulk` y muestra un toast con hechos, fallidos y omitidos. Ambos botones estan deshabilitados si su plan esta vacio.

- [ ] **Step 1: Pruebas** (happy-dom): `a not detected agent shows no Install button` (Review: la fila de Claude con `detectedEditors` vacio), `a detected agent without integration shows Install`, `detect-only agents show Detected and no buttons`, `Install all installs only missing detected agents and skips blocked ones` [Review Focus 4 y 5; con Codex en `unavailable`], `Uninstall all asks for confirmation listing the agents before removing`, `both bulk buttons are disabled when there is nothing to do`. Actualizar `AgentIntegrationRow.test.tsx` para la prop `detected`.
- [ ] **Step 2: Ejecutar** `pnpm vitest run src/settings` -> FAIL.
- [ ] **Step 3: Implementar**. `AgentIntegrations` recorre `KNOWN_AGENTS`, mantiene los cinco `useIntegration` actuales (cantidad fija de hooks) y calcula el `RowState` de cada integrable con `rowStateOf`.
- [ ] **Step 4: Ejecutar** -> PASS, `pnpm check-types`, `pnpm lint`.
- [ ] **Step 5: Commit**: `git add -A src && git commit -m "Show real agent states in Settings and add Install all"`

---

### Task 9: Modal del onboarding, chip y recordatorio

**Files:**
- Create: `src/modules/onboarding/OnboardingDialog.tsx`, `OnboardingHost.tsx`, `OnboardingChip.tsx`, `steps/WelcomeStep.tsx`, `StyleStep.tsx`, `PermissionsStep.tsx`, `AgentsStep.tsx`, `DoneStep.tsx`, `onboardingUi.ts` (zustand `{ open: boolean }`, `openOnboarding()`, `closeOnboarding()`), `index.ts`, y pruebas `OnboardingHost.test.tsx`, `OnboardingDialog.test.tsx`
- Modify: `src/app/App.tsx` (montar `<OnboardingHost />` junto a `AgentNotificationsBridge`), `src/modules/header/Header.tsx` (renderizar `<OnboardingChip />` junto a `ActionsBar`), `src/modules/agents/lib/integrationSuggestionFlow.ts` (+ test), `src/modules/agents/components/IntegrationSuggestionToast.tsx`

**Interfaces:**
- Consumes: `Preferences.onboarding`, `updateOnboarding`, `startupAction`, `visibleSteps`, `stepAfter`, `stepBefore`, `finish`, `STYLE_PRESETS`, `chipLabel`, `showChip`, `suppressIntegrationToast` (Task 5); `PermissionsList` (Task 6); filas de agentes y `runBulk` (Tasks 3, 4 y 8); `setExplorerGitColorScheme`, `setPreviewOnClick`.
- Produces: `SuggestDeps` gana `suppressed: () => boolean`; `createIntegrationSuggester` sale antes de consultar nada (y sin registrar el aviso) si `suppressed()` es verdadero. `IntegrationSuggestionToast.tsx` le pasa `() => suppressIntegrationToast(usePreferencesStore.getState().onboarding)`.

Comportamiento:
- `OnboardingHost`, una vez hidratadas las preferencias, evalua `startupAction`: `openModal` abre el modal y guarda `shown: true`; `remind` muestra un unico toast "Finish setting up Kex" con accion "Continue" que abre el modal, y guarda `reminded: true`; `none` no hace nada.
- El modal tiene barra de progreso (`@/components/ui/progress`), botones Back / Next / Skip y siempre "Continue later". "Continue later" cierra sin cambiar `step` (queda en el paso actual, que se guarda en cada cambio con `updateOnboarding`). Terminar en `done`, o descartar desde la chip, llama a `finish`.
- Paso Style: dos opciones (JetBrains, VS Code) que aplican `STYLE_PRESETS` con los dos setters; la opcion marcada sale de los valores actuales.
- Paso Permissions solo si `IS_MAC`; paso Agents: filas de agentes (mismos componentes que Settings) y "Install all".
- `OnboardingChip`: visible si `showChip`; texto `chipLabel`; clic abre el modal en `state.step`; un menu pequeno ofrece "Dismiss setup" (`finish`).

- [ ] **Step 1: Pruebas**: `integrationSuggestionFlow` (`does not look at anything nor record an ask while suppressed`); `OnboardingHost` (`opens the modal on first run and records shown`, `reminds once on the next run`, `does nothing when finished`); `OnboardingDialog` (`Continue later keeps the current step`, `the chip label reopens at the saved step`, `style step applies the JetBrains preset`, `permissions step is absent outside macOS`, `finishing marks the onboarding finished and hides the chip`).
- [ ] **Step 2: Ejecutar** `pnpm vitest run src/modules/onboarding src/modules/agents` -> FAIL.
- [ ] **Step 3: Implementar** componentes finos sobre las funciones puras; usar solo componentes shadcn y hugeicons, el estilo de `HibernateDialog.tsx` como referencia del modal.
- [ ] **Step 4: Ejecutar** -> PASS; despues `pnpm lint && pnpm check-types && pnpm test`.
- [ ] **Step 5: Verificacion manual** con `pnpm tauri dev` y un `settings-general.json` borrado: el modal sale solo; "Continue later" deja la chip; reiniciar muestra un unico toast y reiniciar otra vez ninguno; con `onboarding.finished = false` y `shown = true` el toast de "agente sin integracion" no sale al ejecutar `claude` en un terminal; terminar el onboarding lo devuelve.
- [ ] **Step 6: Commit**: `git add -A src && git commit -m "Add the first-run onboarding, its chip and the reminder"`

---

### Task 10: Documentacion viva

**Files:**
- Modify: `docs/NOTIFICATIONS.md` (seccion "Install reminder": relacion con el onboarding y la dependencia `suppressed`), `docs/ARCHITECTURE.md` (modulos `onboarding` y `permissions`), `docs/SETTINGS_UI.md` (filas de agentes con estados y Install all), `docs/FORK.md` (divergencias respecto al upstream: onboarding, permisos, camara y microfono fuera)

- [ ] **Step 1: Actualizar los cuatro documentos** con lo realmente construido, sin tablas de pruebas manuales nuevas.
- [ ] **Step 2: Comprobar** `grep -rn "—" docs/superpowers docs/NOTIFICATIONS.md docs/ARCHITECTURE.md docs/SETTINGS_UI.md docs/FORK.md` -> sin em-dash nuevos.
- [ ] **Step 3: Verificacion final completa**: `pnpm lint && pnpm check-types && pnpm test` y `cd src-tauri && cargo clippy && cargo test --locked`, todo en verde.
- [ ] **Step 4: Commit**: `git add docs && git commit -m "Document onboarding, permissions and agent states"`

---

## Self-review

- **Cobertura del spec:** onboarding de primera vez y deteccion de primer arranque (Task 5, 9); pasos y estilo (9); permisos y Settings (1, 6, 7); estados de fila, Install/Uninstall all y guarda (3, 4, 8); sincronizacion del arranque (4); chip, recordatorio y supresion del toast (5, 9); camara y microfono (2); documentacion (10). El paso "Tu header" queda fuera, como dice el spec.
- **Consistencia de tipos:** `RowState` (Task 3) lo usan `planBulk` y las filas (4, 8); `OnboardingState` (5) lo usan el host, el dialogo y la chip (9); `PermissionKind` y `ProbeState` coinciden en camelCase entre Rust (1) y TypeScript (6).
- **Desviacion del spec:** la guarda de "no instalar un agente no detectado" vive en `installAgent` (el unico camino) y no en cada comando de Rust, para no sondear el PATH en cada escritura. Task 4 corrige la linea del spec en el mismo commit.
- **Orden:** 1 y 2 son independientes del resto; 3 antecede a 4 y 8; 5 antecede a 9; 6 antecede a 7 y 9.
