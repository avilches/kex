---
title: Demo del Live Preview
tags: [markdown, prueba]
autor: Kex
---

# Demo del Live Preview de Kex

Este fichero recorre todo lo que soporta el motor Live Preview. Cada sección dice qué debería verse. Pon el cursor en cualquier línea para ver el markdown crudo, y sácalo para ver el resultado. El bloque de arriba entre `---` es el frontmatter: debe verse en monoespaciado con un fondo suave, sin interpretar nada.

## 1. Encabezados

# H1 encabezado de primer nivel
## H2 encabezado de segundo nivel
### H3 encabezado de tercer nivel
#### H4 encabezado de cuarto nivel
##### H5 en negrita y al tamaño del texto
###### H6 en negrita, más pequeño y algo apagado

Texto normal justo debajo para comparar tamaños y el espacio entre encabezado y párrafo.

## 2. Párrafos y saltos de línea

Estas tres líneas seguidas
forman un solo párrafo
y deben verse como un texto que fluye y se corta solo.

Aquí termina el párrafo anterior porque hay una línea en blanco.

Esta línea acaba con dos espacios y fuerza un salto duro:  
por eso esta va debajo.

Esta acaba con una barra invertida y también fuerza un salto duro:\
y esta va debajo.

Un párrafo muy largo para comprobar cómo se ajusta al ancho del editor: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.

## 3. Formato en línea

Texto en **negrita**, en *cursiva*, en _cursiva con guion bajo_, en __negrita con guion bajo__, en ***negrita y cursiva***, ~~tachado~~ y con `código en línea`.

Combinaciones: **negrita con `código` dentro**, *cursiva con **negrita** dentro* y ~~tachado con **negrita**~~.

El `código en línea` debe verse más pequeño que el texto, con un poco de padding y nunca en cursiva, aunque el tema la ponga.

Subíndice y superíndice: H~2~O, CO~2~, X^2^, E = mc^2^ y a^n^ + b^n^ = c^n^.

Escapes: \*no es cursiva\*, \# no es un encabezado, \[no es un enlace\] y 1\. no es una lista.

Entidades y emoji: &amp; &lt; &gt; &copy; y :smile: :rocket:

## 4. Enlaces

- Enlace en línea: [Documentación de GitHub](https://docs.github.com)
- Enlace con título (pasa el ratón): [GitHub](https://github.com "Ir a GitHub")
- Enlace con etiqueta de referencia: [texto del enlace][ref-github]
- Enlace de referencia abreviado: [ref-id]
- Enlace de referencia colapsado: [ref-id][]
- Referencia sin distinguir mayúsculas: [REF-ID]
- Enlace que no debe ser enlace, porque no existe la referencia: [sin-definicion]
- Corchetes normales: [TODO] y [[Wiki Link]]
- Autoenlace: <https://example.com>
- URL suelta: https://example.com/ruta/larga?param=1
- Enlace dentro de negrita: **[GitHub](https://github.com)**

Un clic normal coloca el cursor; Cmd/Ctrl+clic abre el enlace.

Las definiciones de referencia van aquí abajo y no deben verse (solo dejan su línea vacía):

[ref-github]: https://github.com "Sitio de GitHub"
[ref-id]: https://example.com "Tooltip de la referencia"

## 5. Imágenes

Imagen al lado del texto, en la misma línea: ![Logo de Markdown](https://markdown-here.com/img/icon256.png "Logo Markdown") y el texto sigue a continuación.

Imagen sola en su línea:

![Logo solo](https://markdown-here.com/img/icon256.png)

Imagen por referencia: ![Logo por referencia][logo-ref] y más texto detrás.

Imagen local que no existe (debe verse el texto alternativo): ![Imagen rota](./no-existe.png)

[logo-ref]: https://markdown-here.com/img/icon256.png "Logo desde una referencia"

## 6. Citas

> Una cita de una línea.

> Una cita de varias líneas que se unen
> en un solo párrafo porque no hay línea en blanco entre ellas,
> y que debe llevar una única barra continua a la izquierda, sin cursiva.

> Una cita muy larga para comprobar que la barra lateral sigue hasta el final cuando el texto se corta en varias líneas dentro del editor: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

> Cita con dos párrafos
>
> Segundo párrafo de la misma cita, con la barra sin cortes.

> Cita anidada, primer nivel
>
> > Segundo nivel, con dos barras
> >
> > > Tercer nivel, con tres barras
>
> De vuelta al primer nivel

>  >    Espacios de más entre los marcadores que deben ignorarse

> Cita con **negrita**, `código` y un [enlace](https://github.com)

> - Lista dentro de una cita
> - Otro elemento
>   - Anidado dentro de la cita

## 7. Listas

### Sin ordenar

- Elemento con guion
- Otro elemento con guion
  - Segundo nivel
  - Otro del segundo nivel
    - Tercer nivel
      - Cuarto nivel
- De vuelta al primer nivel

* Elemento con asterisco
* Otro elemento con asterisco

+ Elemento con más
+ Otro elemento con más

### Ordenadas

1. Primer paso
2. Segundo paso
   1. Sub-paso A
   2. Sub-paso B
      1. Sub-sub-paso
3. Tercer paso
10. Número alto para ver la alineación

### Tareas

- [ ] Tarea pendiente
- [x] Tarea hecha
- [X] Tarea hecha con mayúscula
- [ ] Tarea con **negrita** y `código`
  - [ ] Subtarea pendiente
  - [x] Subtarea hecha
- Elemento normal mezclado con tareas
- [ ] Otra tarea

El checkbox debe quedar donde iría el bullet, y el texto alineado con el de un elemento normal. Al poner el cursor en una tarea se ve `- [ ]` como texto editable.

### Elementos con varias líneas

- Este elemento tiene un texto muy largo que se corta en varias líneas dentro del editor, para comprobar cómo se alinean las líneas siguientes y el espacio entre elementos: Lorem ipsum dolor sit amet, consectetur adipiscing elit.
- Elemento con dos líneas seguidas
  que se unen en un solo párrafo.
- Elemento con un bloque de código dentro:

  ```js
  console.log("dentro de una lista");
  ```

## 8. Bloques de código con valla

```javascript
// JavaScript
const suma = (a, b) => {
  return a + b;
};
console.log(suma(5, 3));
```

```typescript
interface Usuario {
  id: number;
  nombre: string;
  activo?: boolean;
}

export function saludar(u: Usuario): string {
  return `Hola, ${u.nombre}`;
}
```

```python
# Python
def fibonacci(n: int) -> list[int]:
    a, b = 0, 1
    resultado = []
    while a < n:
        resultado.append(a)
        a, b = b, a + b
    return resultado

print(fibonacci(100))
```

```rust
// Rust
fn main() {
    let numeros: Vec<i32> = (1..=5).collect();
    println!("{:?}", numeros);
}
```

```bash
#!/usr/bin/env bash
set -euo pipefail
for f in *.md; do
  echo "Procesando $f"
done
```

```json
{
  "nombre": "demo",
  "version": "1.0.0",
  "activo": true,
  "numeros": [1, 2, 3],
  "nulo": null
}
```

```yaml
servicio:
  nombre: demo
  puertos:
    - 8080
    - 8443
  activo: true
```

```css
.tarjeta {
  display: grid;
  gap: 1rem;
  color: var(--foreground);
}
```

```html
<div class="nota">
  <p>HTML dentro de una valla</p>
</div>
```

```sql
SELECT id, nombre FROM usuarios WHERE activo = TRUE ORDER BY nombre;
```

```diff
- línea eliminada
+ línea añadida
  línea sin cambios
```

Sin lenguaje (texto sin resaltar, nunca en cursiva):

```
texto sin lenguaje
    con sangría propia
**esto no es negrita**
```

Con un lenguaje desconocido:

```lenguaje-inventado
esto no tiene resaltado
```

Un bloque de una sola línea:

```js
console.log("una línea");
```

Un bloque vacío (no debe desaparecer):

```js
```

## 9. Código indentado

Texto normal y, debajo, código con cuatro espacios de sangría, que debe verse como un bloque de código con el mismo padding que los de valla:

    primera línea de código indentado
    segunda línea de código indentado

        con una sangría extra dentro del bloque

    y otra línea tras una línea en blanco

Texto normal otra vez.

## 10. Tablas

| Nombre     | Tipo    | Descripción                        |
|------------|---------|------------------------------------|
| `id`       | número  | Identificador único                |
| `nombre`   | texto   | Nombre del **usuario**             |
| `sitio`    | enlace  | [GitHub](https://github.com)       |

Con alineación:

| Izquierda | Centro | Derecha |
|:----------|:------:|--------:|
| a         |   b    |       c |
| texto más largo | medio | 1234 |

Una tabla pequeña (no debe ocupar el 100%):

| A | B |
|---|---|
| 1 | 2 |

Con celdas vacías:

| Uno | Dos | Tres |
|-----|-----|------|
| x   |     | z    |
|     | y   |      |

## 11. Reglas horizontales

Texto antes.

---

Texto entre reglas.

***

Texto entre reglas.

___

Texto después.

## 12. HTML embebido

Un comentario HTML (debe verse discreto):

<!-- COMENTARIO: esto no se muestra en un markdown renderizado -->

Etiquetas en línea: salto<br/>de línea, <kbd>Ctrl</kbd> + <kbd>C</kbd>, <b>negrita HTML</b>, <i>cursiva HTML</i>, <mark>marcado</mark> y <sub>sub</sub>/<sup>sup</sup> HTML.

Un bloque HTML:

<div align="center">
  <h3>Título dentro de un div</h3>
  <p>Párrafo con <a href="https://github.com">un enlace</a> y <strong>negrita</strong>.</p>
</div>

<details>
<summary>Desplegable HTML</summary>

Contenido del desplegable en **markdown**.

</details>

## 13. Mezclas y casos límite

1. Lista ordenada con código dentro:

   ```bash
   echo "hola"
   ```

2. Y una cita dentro:

   > Cita dentro de un elemento de lista

3. Y una tabla dentro:

   | A | B |
   |---|---|
   | 1 | 2 |

> Cita con un bloque de código dentro:
>
> ```python
> print("dentro de una cita")
> ```

- **Negrita** al principio de un elemento
- *Cursiva* al principio de un elemento
- `Código` al principio de un elemento
- [Enlace](https://github.com) al principio de un elemento

# Encabezado con **negrita**, `código` y [enlace](https://github.com)

Una línea con muchos formatos: **negrita**, *cursiva*, ~~tachado~~, `código`, [enlace](https://github.com), H~2~O, X^2^, ![img](https://markdown-here.com/img/icon256.png "logo") y \*escape\*.

## 14. Final

Fin del documento de prueba. Si todo lo anterior se ve bien, el Live Preview cubre lo habitual de markdown.
