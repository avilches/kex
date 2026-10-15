---
name: webview-debug-via-fetch
description: Como observar valores del webview de Kex durante un arranque real, cuando la consola no llega a ningun log accesible
metadata:
    node_type: memory
    type: reference
---

Los `console.log` del webview (WKWebView) no aparecen en el log unificado de macOS con un
filtro por `eventMessage` ni en el stdout de `pnpm tauri dev`, asi que para diagnosticar bugs
del arranque real no hay consola que leer. La tecnica que funciono (bug 21 de
`docs/WORKSPACES_GOTCHAS.md`, 2026-10-15):

1. Arrancar un receptor HTTP trivial: `python3 -m http.server 9977` en background; cada
   GET queda registrado en su stdout con la query completa.
2. Instrumentar el codigo con un `fetch("http://localhost:9977/n?d=" +
   encodeURIComponent(JSON.stringify(valores)), { mode: "no-cors" })`. El `no-cors` evita
   errores en consola; el GET llega igual.
3. El dev server de Vite sirve el cambio y una relanzada del binario debug
   (`src-tauri/target/debug/kex`, que conecta a devUrl) reproduce el arranque con la
   instrumentacion. Para ver el arranque NO vale HMR (conserva el estado del componente);
   hay que cerrar y relanzar el binario.

Para decodificar el registro: los payloads van URL-encoded y rodeados de codigos ANSI;
regex `GET .*?/n\?d=([^ ]*?)\x1b` y `urllib.parse.unquote`.

Ojo: instrumentar en un worktree propio, nunca en el checkout principal (regla de
`feedback_worktree_ownership.md`).
