# AGENTS

## Repo de referencia

Este directorio `sportmassage-ref/` es la referencia canónica de trabajo.

Repositorio remoto:

- `https://github.com/samuelhogarola-ship-it/sportmassage.git`

## Entrada principal

- En hosting, la home se sirve como `index.html`
- En este repo se conserva también `index-3.html` como respaldo histórico
- La navegación legal debe apuntar a `index.html`

## Problema detectado

La home tenía el logo roto porque apuntaba a `images/logo.png`, pero el archivo real está en la raíz como `logo.png`.

También faltaba declarar favicon en las páginas principales.

## Regla de trabajo

Antes de editar o desplegar:

1. confirmar que el trabajo se hace en este repo
2. comprobar que la home activa es `index.html`
3. verificar que `logo.png` existe en raíz
4. evitar volver a crear copias paralelas del proyecto
