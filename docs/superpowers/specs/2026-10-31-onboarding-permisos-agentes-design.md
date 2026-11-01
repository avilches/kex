# Onboarding, permisos de disco e integraciones de agentes

Fecha: 2026-10-31. Estado: borrador para aprobar.

## Intención

Kex depende de dos cosas que el usuario tiene que conceder al principio y que hoy nadie le pide:
acceso al disco (los agentes corren en terminales de Kex y leen carpetas protegidas por macOS) y la
instalación de las integraciones de agentes (sin ellas no hay spinner, ni avisos, ni sesiones que
sobrevivan). Hoy la única ayuda es un toast que sale cuando un agente ya está corriendo sin
integración, como mucho dos veces.

El objetivo es una primera experiencia guiada, al estilo de Raycast: un modal de varios pasos que
engancha al usuario, deja Kex configurado a su gusto y se puede cerrar con "seguir más tarde" sin
perder el hilo. Además, los mismos controles viven en Settings para poder revisarlos cuando quieras.

## Objetivos

1. Onboarding de primera vez en la ventana principal, con pasos: bienvenida, estilo, permisos (solo
   macOS), agentes y listo.
2. "Seguir más tarde": una chip discreta en el Header con el progreso, que reabre el modal en el
   paso donde se dejó.
3. Settings, sección de agentes: cada agente conocido con su icono y su estado real, y los botones
   "Install all" y "Uninstall all" para las integraciones.
4. Settings, sección nueva de permisos (solo macOS): estado de cada acceso a disco, con un botón para
   volver a comprobarlo y, si está denegado, para abrir el panel exacto de Privacidad.
5. Quitar cámara y micrófono del `Info.plist` y de `entitlements.plist` (heredados del upstream,
   Kex no los usa).

## Fuera de alcance

- El paso "Tu header" (elegir qué agentes y apps van como botón y cuáles al combo). Se hará cuando
  termine el cambio del modelo de agentes y apps que está en marcha. Hasta entonces la siembra
  automática de Actions sigue igual. Cuando se haga, la regla es: lo que el usuario marca va como
  botón del header y lo demás se queda en el combo, para agentes y para apps.
- Permiso de notificaciones del sistema (decisión del diseño, ver "Decisiones del diseño").
- Avisar desde el explorer cuando una carpeta falla por permisos. Solo se puede resolver desde
  Settings.
- Linux y Windows: el paso de permisos y la sección de permisos no existen allí.

## Anti-objetivos

- Que el onboarding moleste: nunca bloquea la app, nunca vuelve a salir solo una vez cerrado con
  "seguir más tarde" salvo por la chip y un único recordatorio suave.
- Que instalar una integración deje carpetas de configuración huérfanas de un agente que no existe.
- Que Kex pida a ciegas permisos que el usuario ya denegó: macOS no vuelve a preguntar, y fingir
  que sí sería engañoso.
- Código de migración o compatibilidad hacia atrás (regla del proyecto).

## Cuándo sale el onboarding

Solo en una instalación nueva. Al arrancar, si ya existía configuración guardada de Kex, el
onboarding se marca como hecho sin mostrarse. Es una comprobación de primer arranque, no una
migración. Los usuarios que se actualizan no ven nada nuevo salvo las secciones de Settings.

## El onboarding

Modal de la ventana principal, con barra de progreso. Cada paso se puede saltar y siempre hay
"Seguir más tarde".

1. **Bienvenida.** Qué es Kex en una frase y qué se va a configurar.
2. **Estilo.** Pregunta "JetBrains o VS Code". Al elegir fija `explorerGitColorScheme` y
   `previewOnClick`: VS Code usa el esquema de colores `vscode` y activa el click para preview;
   JetBrains usa su esquema y lo desactiva (JetBrains no tiene preview). Se puede cambiar luego en
   Settings.
3. **Permisos** (solo macOS). Lista de accesos con su estado (ver más abajo) y un botón "Comprobar
   todo". Un acceso denegado enseña un botón para abrir el panel de Privacidad.
4. **Agentes.** Los agentes conocidos con su icono y estado, y el botón "Instalar todas las
   integraciones" que actúa solo sobre los detectados sin integración.
5. **Listo.** Resumen de lo configurado y de lo que quedó pendiente.

### Seguir más tarde

Cerrar el modal sin terminar guarda el paso actual. A partir de ahí hay una chip en el Header
("Terminar configuración 3/5") que reabre el modal en ese paso, y un único toast suave en el
siguiente arranque. La chip tiene una opción para descartarla del todo, y entonces el onboarding
queda como terminado.

Mientras el onboarding esté sin terminar, el toast actual de "agente sin integración" no sale, para
no duplicar avisos. Cuando se descarta o se termina, ese toast vuelve a funcionar como red de
seguridad con sus reglas de siempre.

## Agentes: estados de fila

Dos hechos distintos: si el agente existe en la máquina (detección) y si la integración de Kex está
puesta en su configuración. La detección usa el mismo escaneo que ya existe (`editor_scan`, que
mira el PATH y las carpetas de instalación habituales).

| Estado | Significa | Se ofrece |
|---|---|---|
| No detectado | El agente no está en la máquina | Nada más que el texto "No detectado" y cómo conseguirlo. Aunque quedara una integración vieja, no se ofrece desinstalar |
| Sin integración | Agente detectado, hooks de Kex sin poner | Install y Preview |
| Integración instalada | Hooks de Kex puestos | Uninstall y Preview |
| Aviso | Agente detectado, pero su configuración no se puede leer o editar con seguridad (los estados `malformed` y `uneditable` actuales) | Texto que lo explica, sin Install |

Settings muestra todos los agentes conocidos con su icono: los cinco con integración (Claude Code,
Codex, OpenCode, OMP y Pi) y los que solo se detectan (Antigravity, OpenClaude, Grok, Aider, Goose y
Cursor Agent). Estos últimos solo dicen "Detectado" o "No detectado", porque no tienen integración.

Corrige además un comportamiento actual inconsistente: hoy Claude Code, OpenCode, OMP y Pi crean su
carpeta de configuración aunque el agente no exista, y solo Codex se niega. Con el diseño nuevo, el
botón no existe para un agente no detectado, y el comando de instalación de cada uno rechaza
instalar si el agente no está detectado.

### Install all y Uninstall all

- **Install all:** instala la integración de cada agente detectado cuyo estado sea "Sin
  integración". Ignora los no detectados y los de aviso. Informa al final de cuáles instaló y cuáles
  no pudo.
- **Uninstall all:** quita la integración de cada agente detectado con la integración instalada.
- Ambos usan el camino único que ya existe (`installAgent` y `removeAgent` en
  `lib/agentIntegration.ts`), para que la contabilidad de `installedOnce` y de
  `installedIntegrations` siga igual.

## Permisos de disco (macOS)

Accesos que se comprueban: Escritorio, Documentos, Descargas, iCloud Drive (solo si existe) y
Acceso total al disco como atajo para no ir carpeta por carpeta.

Cómo se comprueba cada uno: intentando leer la carpeta desde Rust. Un error de permisos significa
denegado; una lectura correcta, concedido. Una pega importante: si el usuario aún no ha decidido,
leer la carpeta provoca el aviso de macOS, así que "sin decidir" no se puede observar sin
dispararlo. Por eso hay tres estados en la interfaz: concedido, denegado y sin comprobar. Pulsar
"Comprobar" en uno sin comprobar puede mostrar el diálogo del sistema, y eso se avisa en el texto.

Lo que no se puede hacer: volver a pedir un permiso ya denegado. Para eso el único camino es abrir
el panel de Privacidad correspondiente (Archivos y carpetas, o Acceso total al disco) con su enlace
profundo. El botón dice "Abrir Ajustes del Sistema", no "Pedir de nuevo".

Para que el aviso de macOS use un texto propio de Kex, se añaden las claves
`NSDesktopFolderUsageDescription`, `NSDocumentsFolderUsageDescription` y
`NSDownloadsFolderUsageDescription` al `Info.plist`, en lugar de las de cámara y micrófono que se
quitan.

## Arquitectura

Núcleo funcional, con la lógica en funciones puras y los comandos de Tauri y los componentes
delgados:

- Función pura que combina detección e integración en el estado de una fila.
- Función pura de decisión de primer arranque.
- Reductor puro del progreso del onboarding (paso actual, saltados, terminado, descartado).
- Función pura que clasifica el resultado de una lectura de carpeta como concedido, denegado o
  sin comprobar.
- Comando de Rust para probar el acceso a una carpeta (el único contacto con el sistema de
  ficheros) y comando para abrir el panel de Privacidad. Se documentan en `docs/IPC.md`.
- Los componentes de fila de agente y de lista de permisos se reutilizan tanto en el modal como en
  Settings, que es otra ventana con su propio webview. El estado del onboarding se guarda en
  `settings-general.json` y las dos ventanas lo leen y lo escriben con el patrón que ya usa
  `integrationSuggestions`.
- El modal es una versión reducida de Settings, no una segunda implementación: mismos componentes,
  distinto marco.

## Invariantes con prueba

- Un usuario con configuración previa nunca ve el onboarding.
- Un agente no detectado nunca recibe una instalación, ni por botón ni por Install all, y no deja
  carpetas creadas.
- Install all no toca agentes en estado de aviso.
- Cerrar con "seguir más tarde" conserva el paso y la chip lo reabre ahí.
- Mientras el onboarding esté sin terminar, el toast actual de integración no se muestra.
- La clasificación de permisos distingue concedido, denegado y sin comprobar.

## Documentación que se actualiza en el mismo commit

`docs/NOTIFICATIONS.md` (recordatorio de instalación y su relación con el onboarding),
`docs/IPC.md` (comandos nuevos y el cambio de los de instalación), `docs/SETTINGS_UI.md` (sección
de permisos y filas de agentes), `docs/ARCHITECTURE.md` (módulo del onboarding) y `docs/FORK.md`.

## Decisiones del diseño (mías, no del usuario)

- Detección de primer arranque por la existencia previa de configuración guardada.
- El toast actual se suprime mientras el onboarding esté sin terminar y vuelve cuando se descarta o
  se termina.
- Un solo recordatorio suave (toast) al arrancar de nuevo, además de la chip.
- La sección de permisos de Settings es nueva y solo aparece en macOS.
- Se ofrece "Acceso total al disco" como atajo.
- Las notificaciones del sistema quedan fuera de este trabajo.
- Los textos de uso de carpetas en el `Info.plist`.
- La sincronización automática del arranque (`main.tsx`: `agent_enable_claude_hooks` y
  `syncIntegrations`) solo refresca las integraciones que ya están instaladas y nunca instala una
  nueva (decisión del usuario). Hoy, con el ajuste de notificaciones activo, reinstala los hooks de
  Claude Code en cada arranque aunque no estén puestos ni Claude exista, lo que crea `~/.claude/` y
  contradice el anti-objetivo de no dejar carpetas huérfanas. Con la regla nueva, ese camino
  comprueba primero el estado de los hooks y solo actúa si están instalados. Tampoco sincroniza un
  agente que no se detecta (decisión del usuario): si el agente se desinstaló y su integración
  quedó puesta, no se toca, y su fila solo dice "No detectado". Así, la sincronización exige las dos
  cosas: agente detectado e integración instalada.
- La comprobación de primer arranque se hace antes de que nada escriba `settings-general.json` en
  esa ejecución; mira si ese fichero ya existía.
- "Uninstall all" pide confirmación con la lista de agentes afectados; "Install all" no, porque
  tiene Preview y es reversible.
- Un agente instalado fuera del PATH que el escaneo no encuentra se considera no detectado. Es una
  limitación asumida.

## Lo que decide quien construya

Texto exacto de cada pantalla, el diseño visual del modal y de la chip (siguiendo los componentes de
shadcn y `INPUT_CLASS` que exige `docs/SETTINGS_UI.md`), el enlace profundo exacto de cada panel de
Privacidad según la versión de macOS, qué ruta se lee para decidir "Acceso total al disco", y si la
detección de agentes se pide con el comando existente o con uno propio más ligero.
