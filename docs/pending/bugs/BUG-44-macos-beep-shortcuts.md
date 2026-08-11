# BUG-44: beep del sistema en macOS al usar atajos de navegacion (Cmd+Ctrl+Flecha)

Estado: pendiente (investigado en una sesion previa; convertido de handoff a pending el 2026-07-07).
Causa raiz confirmada y dos intentos fallidos documentados abajo. Recomendacion de esa investigacion:
implementar la Opcion B (responder chain sink) y escalar a la Opcion A (NSEvent local monitor) si rompe
algo visible. Requisito del usuario: debe funcionar para CUALQUIER atajo reasignable, no solo defaults.

## Síntoma

Al pulsar Cmd+Ctrl+Left/Right/Down en la terminal (navegación entre panes), el
sistema emite un beep. Cmd+Ctrl+Up no pita porque Mission Control lo intercepta
antes de que llegue a la app.

El usuario ha añadido el requisito: la solución debe funcionar para CUALQUIER
shortcut registrado en el sistema de shortcuts de Kex, no solo los combos
hardcodeados por defecto.

## Causa raíz confirmada

**WKWebView → interpretKeyEvents: → doCommandBySelector: → NSBeep()**

1. WKWebView recibe `keyDown:` para Cmd+Ctrl+Left
2. WKWebView llama a `interpretKeyEvents:` (AppKit input system)
3. `interpretKeyEvents:` intenta mapear la combinación a un selector de edición
   de texto (movimiento de cursor, etc.)
4. Llama a `doCommandBySelector:` en WKWebView
5. WKWebView no reconoce el selector (no es un comando de edición estándar)
6. WKWebView llama `[super doCommandBySelector:]`
7. NSResponder lo pasa por la cadena de respuesta (nextResponder)
8. Nadie lo maneja → NSBeep()

**Por qué `e.preventDefault()` en JS no ayuda:** JavaScript puede llamar
`preventDefault()` en el evento `keydown`, pero esto no suprime la capa de
AppKit que actúa de forma independiente. Son dos capas paralelas.

## Intentos fallidos

### Intento 1: `e.preventDefault()` en `useGlobalShortcuts` y `customKeyEventHandler` (COMMIT ceb5b52)

- Mejoró Cmd+C (porque xterm.js lo maneja antes de que llegue a `interpretKeyEvents:`)
- NO funcionó para Cmd+Ctrl+Arrow: el beep viene de AppKit, no del layer JS

### Intento 2: Menu items nativos con aceleradores Cmd+Ctrl+Arrow (COMMIT bf87ee4 - REVERTIDO)

**Plan**: Los NSMenuItem con `performKeyEquivalent:` interceptan ANTES de que
`NSWindow.sendEvent:` pase el evento a WKWebView. Si el menú maneja el evento,
WKWebView nunca llama a `keyDown:` ni a `interpretKeyEvents:`.

**Implementación**: Se añadieron 3 items al menú View con aceleradores
`"Cmd+Ctrl+ArrowLeft/Right/Down"`, verificando que muda 0.19.3 soporta estos
aceleradores y que los convierte correctamente a NSMenuItem con:
- `keyEquivalent = "\u{F702}"` (carácter Unicode del cursor izquierdo)
- `keyEquivalentModifierMask = NSCommandKeyMask | NSControlKeyMask`

**Por qué falló** (según el usuario: "sigue pitando"):
- No se confirmó si el app fue reiniciado con el nuevo binario de Rust
- Más importante: el usuario señaló que esto es **hardcoded** y no funciona si
  el usuario reasigna `pane.focusLeft` a otro combo de teclas

**Problema fundamental del enfoque de menú**: Los aceleradores del menú son
estáticos. Si el usuario reasigna los shortcuts desde Settings, el menú
seguiría interceptando los combos viejos (o no interceptaría los nuevos).

## Análisis de la solución correcta

La solución debe ser:
1. **General**: funcionar para cualquier combo de teclas que tenga asignado un
   shortcut de Kex, no solo los defaults
2. **Nativa**: a nivel de AppKit, no de JavaScript
3. **Sin romper**: no debe afectar la edición de texto real en contenteditable,
   scratchpad, ni IME (input method editor para CJK)

### Opción A: NSEvent local monitor (MEJOR opción)

Intercepta NSEvents ANTES de que lleguen a `interpretKeyEvents:`. Devolviendo
`nil` desde el monitor, el evento no llega a WKWebView y no hay beep.

**Flujo**:
1. Monitor recibe NSKeyDown
2. Comprueba si coincide con algún shortcut registrado en Kex
3. Si sí: dispatch sintético a JS (para que el shortcut system JS lo maneje) +
   retorna `nil` (suprime el evento nativo = no beep)
4. Si no: retorna el evento sin modificar

**Problema**: Para saber qué shortcuts están registrados en cada momento, se
necesita sincronización entre Rust y JS. Los shortcuts son dinámicos (el
usuario puede reasignarlos).

**Variante simplificada**: Suprimir SIEMPRE los NSKeyDown que llegan cuando la
terminal tiene el foco (xterm.js textarea es el primer respondedor). El JS
shortcut system siempre dispara primero y maneja la navegación.

**API disponible en el binario** (ya presente como dependencia transitiva de
muda):
```
objc2-app-kit 0.3.2 → NSEvent::addLocalMonitorForEventsMatchingMask_handler
block2 0.6.2 → RcBlock::new(|event: NonNull<NSEvent>| -> *mut NSEvent { ... })
```

No se necesitan añadir dependencias nuevas, solo declararlas explícitamente en
Cargo.toml.

### Opción B: Responder chain sink (define_class!)

Insertar un objeto NSObject customizado en la cadena de respuesta de WKWebView
que capture `doCommandBySelector:` como no-op.

**Implementación con objc2 0.6.4** (macro renombrada de declare_class! a
define_class!):
```rust
define_class!(
    #[unsafe(super(NSObject))]
    #[name = "KexDoCommandSink"]
    struct KexDoCommandSink;

    impl KexDoCommandSink {
        #[unsafe(method(doCommandBySelector:))]
        fn do_command_by_selector(&self, _selector: Sel) {
            // no-op: absorbe comandos no manejados, previene NSBeep
        }
    }
);
```

Luego, al crear cada ventana, insertar el sink en la cadena:
```rust
window.with_webview(|wv| {
    // wv.inner() devuelve *mut c_void (el WKWebView)
    let wkwebview = wv.inner() as *mut AnyObject;
    let sink = KexDoCommandSink::alloc().init();  // simplificado
    let original_next: *mut AnyObject = msg_send![wkwebview, nextResponder];
    let _: () = msg_send![sink, setNextResponder: original_next];
    let _: () = msg_send![wkwebview, setNextResponder: sink];
    // retain para que viva eternamente
});
```

**Riesgo**: WKWebView usa `doCommandBySelector:` para reenviar comandos de
edición al WebContent process. Si absorbemos TODO, se rompe la edición en
páginas con contenteditable (negrita, cursiva, etc.). 

**Mitigación**: Según el código WebKit, WKWebView reconoce los comandos
estándar (bold, italic, move*, select*, etc.) y los reenvía al WebContent
ANTES de llegar a `[super doCommandBySelector:]`. Solo llaman a `[super]` los
selectores desconocidos. Por tanto, absorber el `[super]` en la cadena es
relativamente seguro. Pero necesita verificación empírica.

### Opción C: Method swizzling de WKWebView.doCommandBySelector: (RIESGOSA)

Reemplazar la implementación de `doCommandBySelector:` en la clase WKWebView
globalmente con una no-op. Rompería la edición de texto en TODAS las instancias
de WKWebView.

**Variante menos riesgosa**: Reemplazar solo la llamada a `[super]` dentro de
la implementación de WKWebView (si se puede obtener y conservar la imp original
y llamarla selectivamente). Muy complejo.

## Información técnica útil para el siguiente intento

### API de objc2 0.6.4 disponible

```rust
// AnyClass::instance_method() + Method::set_implementation()
let cls = AnyClass::get(c"WKWebView").unwrap();
let sel = sel!(doCommandBySelector:);
let method = cls.instance_method(sel).unwrap();
// Imp = unsafe extern "C-unwind" fn()
let imp: Imp = std::mem::transmute(my_fn as unsafe extern "C-unwind" fn(*mut AnyObject, Sel, Sel));
method.set_implementation(imp); // requiere: &Method, no &AnyMethod
```

### API de PlatformWebview en Tauri 2.11.2

```rust
// PlatformWebview::inner() devuelve *mut std::ffi::c_void en macOS
// Castear a *mut AnyObject para msg_send!
let wkwebview = wv.inner() as *mut AnyObject;
```

### define_class! syntax en objc2 0.6.4

```rust
use objc2::{define_class, ClassType, DefinedClass};
use objc2::runtime::NSObject;  // (NO objc2_foundation::NSObject para este caso básico)

define_class!(
    #[unsafe(super(NSObject))]
    #[name = "KexMyClass"]
    pub struct MyClass;

    impl MyClass {
        #[unsafe(method(myMethod:))]
        fn my_method(&self, arg: Sel) { ... }
    }
);
// Luego: MyClass::class() para obtener la clase
//        unsafe { msg_send![MyClass::class(), alloc] } + msg_send![alloc, init]
```

### block2 0.6.2 + NSEvent monitor

```rust
// Ya disponibles transitivamente, solo añadir a Cargo.toml:
// objc2-app-kit = { version = "0.3", features = ["NSEvent", "NSApplication"] }
// block2 = "0.6"

use block2::RcBlock;
use objc2_app_kit::{NSEvent, NSEventMask};

let handler = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
    // ... check event, dispatch synthetic keydown to JS, return null to suppress
    event.as_ptr()
});
let monitor = unsafe {
    NSEvent::addLocalMonitorForEventsMatchingMask_handler(
        NSEventMask::KeyDown,
        &*handler,
    )
};
std::mem::forget(monitor); // keep alive forever
std::mem::forget(handler); // keep alive forever
```

## Recomendación para la próxima sesión

**Implementar Opción B (responder chain sink)** como primer intento porque:
- No requiere bloques ObjC complejos (solo `define_class!` + `msg_send!`)
- El riesgo de romper contenteditable es bajo (WebKit reenvía antes de [super])
- No requiere sincronizar qué shortcuts están registrados (absorbe todo)
- Funciona para cualquier remapeo de shortcuts

Si Opción B rompe algo visible, escalar a Opción A (NSEvent monitor) que es
más precisa pero requiere más código (blocks, sincronización JS-Rust).

## Nota sobre el intento de menú (por qué puede no haber interceptado)

Para que `NSMenuItem.performKeyEquivalent:` intercepte, `NSApplication.sendEvent:`
debe comprobar el menú ANTES de enviar el evento a NSWindow. Si wry/tao
personaliza `sendEvent:`, esto podría saltarse. No se verificó si era un
problema de binario no actualizado o de que el menú no intercepta.

## Estado del repo

- commit ceb5b52: fix parcial (Cmd+C mejorado), EN MAIN
- commit bf87ee4: intento de menú, REVERTIDO en 2d893fc
- rama: main
