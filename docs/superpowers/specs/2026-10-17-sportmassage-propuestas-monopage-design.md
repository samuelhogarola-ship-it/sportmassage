# Sport Massage Fuengirola: propuestas monopágina

## Objetivo

Crear tres propuestas visuales navegables de la web pública de Sport Massage Fuengirola, manteniendo el contenido y el modelo monopágina de la web actual.

## Rutas

- `/propuesta/color-diferente/`
- `/propuesta/moderno/`
- `/propuesta/creativa/`

Las rutas vivirán dentro del repositorio de `sportmassage` y no modificarán la página principal existente.

## Contenido común

Cada propuesta conservará el propósito comercial de la web actual: presentación del servicio de masaje deportivo, beneficios, llamada a reservar, ubicación/contacto y navegación legal. Los enlaces de teléfono, email, WhatsApp y navegación deben seguir siendo funcionales cuando existan en la web actual.

## Dirección visual

1. **Color diferente**: misma arquitectura de información, con una paleta alternativa claramente diferenciada y contraste accesible.
2. **Moderno**: tono más editorial y premium, más espacio en blanco, tipografía limpia, superficies suaves y una jerarquía visual más refinada.
3. **Creativa**: composición monopágina más expresiva, con bloques asimétricos, ritmo visual y recursos gráficos/imágenes con personalidad, sin sacrificar legibilidad ni conversión.

Cada propuesta usará imágenes propias coherentes con su dirección visual. Las imágenes no incluirán texto, logotipos inventados ni marcas de agua.

## Implementación

- Las páginas serán estáticas y autocontenidas dentro de cada carpeta de propuesta.
- Se reutilizarán los activos de marca existentes cuando sea apropiado.
- Los estilos podrán compartir una base mínima, pero cada propuesta tendrá variables y composición propias para que la comparación sea real.
- La página principal actual debe permanecer sin cambios funcionales.

## Validación

- Cada ruta debe existir y cargar desde su `index.html`.
- No debe haber enlaces internos rotos ni recursos con rutas relativas inválidas.
- Las páginas deben conservar el formato monopágina y funcionar en móvil y escritorio.
- Se revisará visualmente cada propuesta después de generarla.
