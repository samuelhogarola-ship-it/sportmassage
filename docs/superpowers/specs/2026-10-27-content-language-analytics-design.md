# Medición del idioma de contenido

## Intención

Medir en Umami qué idioma de contenido está viendo realmente cada visita de Sport Massage, para que WF Studio pueda representar español, inglés y finés sin inferir el idioma del navegador.

## Alcance

- Emitir el evento exacto `page-language:<code>` para `es`, `en` o `fi`.
- Medir el idioma inicial de cada página pública y cada cambio real de `document.documentElement.lang`.
- Deduplicar selecciones repetidas del mismo idioma durante la vida de la página.
- Cubrir home, legal, propuestas estáticas, índice del blog y artículos generados.
- Mantener el tracker Umami existente: el helper no carga analítica y no hace nada cuando `window.umami.track` no existe.
- Hacer que GitHub Pages prepare su copia efímera antes de subirla, inyectando el tracker cookie-free únicamente con el website ID y la URL pública verificados de Sport Massage. El árbol fuente y los artículos permanecen intactos.
- No enviar rutas, textos, identificadores, datos personales ni contenido de artículos.

## Enfoques

1. Añadir llamadas en cada selector de idioma. Es explícito, pero duplica código y deja sin cubrir páginas futuras.
2. Observar el atributo `lang` del elemento raíz con un helper compartido. Cubre carga, cambios y páginas generadas con un único contrato. Es el enfoque elegido.
3. Inferir desde `navigator.language`. Se descarta porque mide preferencia del navegador, no contenido mostrado.

## Restricciones

El helper se distribuye como activo estático, permanece inerte sin Umami verificado y conserva la política actual de analítica sin cookies. La preparación de Pages falla cerrada si el UUID, la URL HTTPS o la confirmación de producción no son válidos, excluye `/admin`, y actualiza en la copia publicada el aviso legal de analítica activa. La PR no publica artículos ni ejecuta el despliegue por sí misma.
