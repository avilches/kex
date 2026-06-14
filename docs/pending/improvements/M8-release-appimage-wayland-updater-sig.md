# M8 — Adoptar el sistema de release de AppImage del upstream (fix libwayland + sig race-free)

## Contexto

El `release.yml` del fork divergio del upstream en el merge-base `8200938`, cuando el fichero
tenia 96 lineas. Despues de ese punto el upstream (crynta) evoluciono su `release.yml` hasta 202
lineas, anadiendo todo el manejo de AppImage que el fork nunca recibio. El fork no contiene nada de
`wayland`, `signer sign` ni `patch-appimage` en su `release.yml` actual.

El commit upstream `afd1167` (`ci(release): patch appimage updater sig in race-free final job, pin
appimagetool, assert strip`) es la ultima pieza de esa cadena. No es un cherry-pick aplicable
aislado: modifica un step (`Fix AppImage wayland libs and re-sign`) que en el fork no existe.

## Que resuelve el sistema del upstream

1. **libwayland obsoletas en el AppImage**: el AppImage bundlea `libwayland-client/egl/cursor.so`
   de Ubuntu 22.04 (libwayland 1.20). En distros con Mesa moderno (Fedora 43, Arch, Bazzite, Mesa
   1.22+) el loader prefiere la copia bundleada vieja y EGL/WebGL rompe con `EGL_BAD_PARAMETER`
   (pantalla en blanco / render roto). El step strippea esas libs del squashfs y re-firma el
   AppImage, forzando a usar las copias del host (ABI-estables, presentes en todo sistema GTK).
2. **Patch race-free de la firma del updater**: la nueva firma del AppImage re-empaquetado se
   parchea en `latest.json` en un job final (`patch-appimage-updater`) que corre despues de que
   todas las patas de la matriz hayan terminado, para que un upload paralelo de macOS/Windows no
   pise el manifiesto combinado del updater.
3. Pin de `appimagetool` a `1.9.1` (en vez de `continuous`) y asserts que fallan si Tauri/linuxdeploy
   dejan de bundlear esas libs (evita shippear un AppImage sin arreglar de forma silenciosa).

## Por que importa al fork

El fork distribuye AppImage con auto-updater (`tauri-plugin-updater`). Sin el fix de wayland, los
AppImages del fork pueden fallar el render en distros con Mesa reciente.

## Trabajo

No es un cherry-pick. Hay que portar la cadena de mejoras del AppImage del `release.yml` del upstream
sobre el `release.yml` del fork (que ya tiene su propia matriz, `4dc87cf`, y el step de APPLE_API_KEY,
`a3069de`). Requiere validar en un release real de CI. Mejora de infra, fuera del scope del sync de
features `upstream-2026-06-13`.

## Referencias

- Upstream: `afd1167` (+ la cadena previa del AppImage en `release.yml` del upstream).
- Plan maestro del sync: `docs/upstream-2026-06-13.md` (CI menores, ~lineas 333-336).
