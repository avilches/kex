---
id: BUG-42
title: Borrar un fichero con el editor abierto - comportamiento sin verificar
area: editor / fs / explorer
severity: low
status: sin confirmar
---

## Descripcion

No esta verificado que pasa cuando se borra un fichero (desde el explorer, desde fuera de la app, o por una herramienta externa) mientras ese fichero esta abierto en un editor.

## Que probar

- Borrar el fichero desde el explorer teniendo el tab del editor abierto: el tab deberia avisar o cerrarse de forma controlada, no quedar en un estado inconsistente.
- Borrar el fichero desde fuera de la app (terminal, otro proceso) y volver al editor: que ocurre al intentar guardar (autosave incluido).
- Comprobar que no se recrea el fichero silenciosamente por un autosave posterior, ni se pierde el aviso de error (relacionado con BUG-30: fs mutations + autosave silencian errores).

## Impacto

Posible perdida de datos, recreacion accidental del fichero borrado, o estado de tab huerfano.

## Pendiente

- Verificacion manual de los casos anteriores.
- Definir el comportamiento deseado (avisar / cerrar / marcar el tab como "borrado en disco").
