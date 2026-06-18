# Obtener datos de uso de Claude Code desde una app externa

## El mecanismo

Claude Code lanza cada ~300ms el comando configurado en `statusLine` como subproceso, le escribe un JSON por **stdin**, y lee el **stdout** para mostrarlo en el terminal. El JSON nunca aparece en el PTY del terminal, solo llega al subproceso del statusLine.

Los `rate_limits` vienen de las cabeceras HTTP que devuelve la API de Anthropic en cada llamada. Claude Code las acumula internamente e inyecta los porcentajes en el JSON del statusLine.

## Formato del JSON recibido por stdin

```json
{
  "model": {
    "id": "claude-sonnet-4-6",
    "display_name": "Sonnet 4.6"
  },
  "context_window": {
    "current_usage": {
      "input_tokens": 45000,
      "cache_creation_input_tokens": 1000,
      "cache_read_input_tokens": 12000
    },
    "context_window_size": 200000,
    "used_percentage": 22
  },
  "rate_limits": {
    "five_hour":  { "used_percentage": 15, "resets_at": 1750000000 },
    "seven_day":  { "used_percentage": 42, "resets_at": 1750621200 }
  },
  "transcript_path": "/Users/foo/.claude/projects/.../session.jsonl",
  "cwd": "/path/to/project",
  "effort": "medium"
}
```

---

## Opción A: Sin plugin, script propio

Crea el script en `~/.claude/hooks/usage-writer.sh`:

```bash
#!/usr/bin/env bash
data=$(cat)
printf '%s' "$data" | python3 -c "
import sys, json, datetime
d = json.load(sys.stdin)
rl = d.get('rate_limits', {})
out = {
  'updated_at': datetime.datetime.utcnow().isoformat() + 'Z',
  'five_hour': rl.get('five_hour'),
  'seven_day': rl.get('seven_day'),
  'context_pct': d.get('context_window', {}).get('used_percentage'),
  'model': d.get('model', {}).get('display_name')
}
print(json.dumps(out, indent=2))
" > /tmp/claude-usage.json 2>/dev/null

# stdout = lo que Claude Code muestra como statusline
# dejarlo vacío = sin HUD visible
```

```bash
chmod +x ~/.claude/hooks/usage-writer.sh
```

Configura en `~/.claude/settings.json`:

```json
{
  "statusLine": "/Users/tuusuario/.claude/hooks/usage-writer.sh"
}
```

---

## Opción B: Con plugin claude-hud

El plugin instala su propio `statusLine` y muestra un HUD visual en el terminal. Para activar la escritura del archivo añadir en su config:

```json
// ~/.claude/plugins/claude-hud/config.json
{
  "display": {
    "externalUsageWritePath": "/tmp/claude-usage.json"
  }
}
```

Escribe automáticamente:

```json
{
  "updated_at": "2026-06-18T16:15:11.179Z",
  "five_hour": { "used_percentage": 11, "resets_at": "2026-06-18T17:20:00.000Z" },
  "seven_day":  { "used_percentage": 42, "resets_at": "2026-06-21T00:00:00.000Z" }
}
```

Limitación: solo escribe usage y balance, no el stdin JSON completo (sin context_pct ni model).

---

## Leer los datos desde Rust/Tauri

Con cualquiera de las dos opciones el resultado es el mismo: un archivo JSON en disco que se actualiza cada ~300ms.

```toml
# Cargo.toml
notify = "6"
serde_json = "1"
```

```rust
use notify::{Watcher, RecursiveMode, recommended_watcher};
use std::{fs, path::Path};

fn watch_claude_usage(app: tauri::AppHandle) {
    let mut watcher = recommended_watcher(move |_| {
        if let Ok(raw) = fs::read_to_string("/tmp/claude-usage.json") {
            if let Ok(data) = serde_json::from_str::<serde_json::Value>(&raw) {
                let seven_day = data["seven_day"]["used_percentage"].as_u64();
                let five_hour = data["five_hour"]["used_percentage"].as_u64();
                app.emit("claude-usage", &data).unwrap();
            }
        }
    }).unwrap();

    watcher.watch(
        Path::new("/tmp/claude-usage.json"),
        RecursiveMode::NonRecursive
    ).unwrap();
}
```

---

## Comparativa

| | Sin plugin (opción A) | Con claude-hud (opción B) |
|---|---|---|
| HUD en terminal | No (o el que quieras) | Sí |
| Archivo JSON | Tú lo escribes | Plugin lo escribe |
| Datos disponibles | Todo el stdin JSON | Solo usage + balance |
| Configuración | `statusLine` en settings.json | `externalUsageWritePath` en config.json del plugin |
