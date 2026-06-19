---
id: BUG-40
title: Stage all / unstage all no procesa todos los ficheros
area: source-control / git
severity: medium
---

## Descripcion

Al pulsar "stage all" o "unstage all" en el panel de Source Control, no se procesan todos los ficheros: algunos quedan en su estado anterior. Tras la operacion el panel sigue mostrando ficheros sin stagear (o sin unstagear) que deberian haberse movido.

## Impacto

El usuario cree que ha staged/unstaged todo y no es asi. Puede commitear menos de lo esperado o dejar fuera cambios sin darse cuenta.

## Hipotesis a investigar

- El comando agrupa los ficheros en una sola llamada (`git_stage` / `git_unstage`) con una lista de pathspecs que se trunca o se construye mal cuando hay muchos ficheros, o cuando hay rutas con caracteres especiales / renames.
- Posible race: el refetch del estado git se dispara antes de que terminen todas las mutaciones (ver BUG-18, race refetch vs fs-changed).
- Posible problema con ficheros en estados mixtos (parcialmente staged) o renames, donde el pathspec no cubre ambos lados.

## Como reproducir

1. Tener un repo con varios ficheros modificados (probar con muchos, y con al menos un rename y rutas con espacios).
2. Pulsar "stage all". Comprobar si quedan ficheros sin stagear.
3. Idem con "unstage all".

## Pendiente

- Confirmar el alcance (numero de ficheros a partir del cual falla, tipos de cambio afectados).
- Localizar si el fallo esta en el cliente (construccion de la lista) o en el comando Rust (`git_stage` / `git_unstage`).
- Anadir test que bloquee el invariante: stage all sobre N ficheros deja 0 sin stagear.
