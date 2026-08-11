# TipTap vs Milkdown: elección de editor WYSIWYG de Markdown para notas

Comparativa técnica entre TipTap y Milkdown como editor WYSIWYG de Markdown para una app de notas basada en archivos (los `.md` en disco son la fuente de verdad). El objetivo es tener el mejor editor posible: precioso visualmente, práctico y que se sienta "natural", sin necesidad de simular Craft o Notion.

## Contexto de partida (HelixNotes)

HelixNotes usa actualmente:

- **TipTap v3** con ~20 extensiones oficiales: tablas (table, table-cell, table-header, table-row), task lists, code blocks con lowlight, imágenes, details, highlight, link, placeholder, subscript/superscript, text-align, typography, underline, color...
- **Extensiones propias**: callouts (la más grande, ~170 líneas de lógica ProseMirror) y wrapSelectedText.
- **markdown-it** con plugins (mark, sub, sup, task-lists) para el parseo de Markdown. La conversión Markdown ↔ documento TipTap es en parte artesanal.
- **Modo fuente**: textarea de Markdown crudo como alternativa al modo enriquecido.

## Lo primero, para calibrar

Ambos son wrappers sobre **ProseMirror**. El techo de lo que se puede conseguir visualmente y en UX es idéntico; lo que cambia es qué te dan de serie y contra qué modelo de datos trabajas.

## Donde gana Milkdown

- **Markdown es su modelo de datos nativo.** Usa remark como pipeline: parsea Markdown a AST, edita sobre él y serializa de vuelta. El round-trip (abrir nota, editar, guardar) preserva la sintaxis con alta fidelidad.
  - En TipTap el documento es JSON de ProseMirror y el Markdown es una conversión en los bordes: cada extensión necesita su regla de parseo y serialización, y es fácil que una nota se "reformatee" sola (bullets que cambian de `*` a `-`, escapes espurios, cambios de espaciado).
  - Para una app donde los archivos `.md` son la fuente de verdad, esta es la diferencia técnica de fondo.
- **Plugins pensados para sintaxis Markdown real**: GFM completo, math/KaTeX, diagramas Mermaid... mapean directamente a la sintaxis que acabará en el archivo, no a un modelo rico que luego hay que aplanar.
- **Crepe**: la distribución "con pilas incluidas" de Milkdown. Visualmente muy cuidada de serie (slash menu, toolbar flotante, placeholder, bloques de código con selector de lenguaje) y con una estética por defecto limpia, de texto fluido, sin sensación de bloques tipo Notion.

## Donde gana TipTap

- **Calidad y mantenimiento de extensiones**: las de TipTap son oficiales y muy pulidas; en Milkdown, fuera del core, se depende más de plugins de comunidad con mantenimiento irregular.
- **Edición de tablas**: la UX de tablas de TipTap (selección de celdas, redimensionar columnas) está más madura.
- **Documentación y comunidad**: mucho mayores. Cuando algo raro pasa en ProseMirror, encontrar respuesta es más fácil en el ecosistema TipTap.
- **Estabilidad de API**: Milkdown ha tenido más churn entre versiones mayores; su API (contexto, slices, composición funcional) tiene una curva de aprendizaje más empinada.

## Sobre la sensación "natural"

Si por natural se entiende lo de Typora u Obsidian Live Preview (la sintaxis Markdown se revela al poner el cursor encima y se renderiza al salir), **ninguno de los dos lo da de serie**. Es trabajo custom sobre ProseMirror en ambos casos, aunque Milkdown parte con ventaja porque su AST ya conserva la sintaxis original.

Si esa sensación fuera el objetivo número uno, la tercera vía sería **CodeMirror 6 con decoraciones** (el enfoque de Obsidian): no es WYSIWYG puro, pero es lo que más "editor de Markdown" se siente.

## Veredicto

- **Solo por mérito técnico** (ignorando coste de migración y lo ya construido): para "el mejor editor WYSIWYG de Markdown para notas en archivos, bonito y natural", **Milkdown es el mejor ajuste**, con Crepe como referencia de lo que da sin esfuerzo. TipTap es mejor herramienta general de rich-text, pero el Markdown siempre será ciudadano de segunda en su modelo.
- **Considerando el estado actual de HelixNotes**: quedarse con TipTap es lo razonable. El ecosistema es más robusto, el problema de fidelidad lo mitiga el modo fuente, y migrar implicaría reescribir el editor entero, las extensiones custom, la toolbar y revalidar todo en Android para un resultado funcionalmente equivalente.
- **Cuándo replantearse Milkdown**: al empezar de cero una app markdown-céntrica, o si el round-trip actual diera problemas serios de fidelidad (Markdown que se reformatea o pierde sintaxis al abrir y guardar sin tocar). En ese caso, antes de migrar de framework, merece la pena invertir primero en el serializador actual.
