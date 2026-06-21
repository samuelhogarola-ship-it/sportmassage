# README

## Flujo recomendado para hacer una PR con Codex

1. Abre Codex dentro de este proyecto y explica el cambio que quieres hacer con el mayor contexto posible.
2. Pide a Codex que revise primero el código afectado antes de editar nada.
3. Confirma con Codex el alcance del cambio si puede afectar contenido, textos, estilos o lógica.
4. Deja que Codex implemente los cambios directamente en los archivos del proyecto.
5. Pide una revisión final con este enfoque:
   - qué ha cambiado
   - qué riesgos quedan
   - qué habría que probar manualmente
6. Revisa en local que la web se vea bien y que los textos estén correctos en todos los idiomas.
7. Si todo está bien, crea la PR con un resumen corto y claro.

## Prompt útil para Codex

```text
Revisa este proyecto, haz los cambios pedidos, comprueba los textos en todos los idiomas y al final dame:
1. resumen de cambios
2. archivos tocados
3. riesgos o validaciones pendientes
4. texto sugerido para la PR
```

## Plantilla de PR

```md
## Qué cambia
- ...

## Por qué
- ...

## Validación
- [ ] Revisado visualmente
- [ ] Textos verificados en ES / EN / FI
- [ ] Enlaces y datos de contacto comprobados

## Riesgos
- ...
```

## Checklist rápida antes de abrir la PR

- No quedan referencias antiguas en ningún idioma.
- Los precios están actualizados en toda la web.
- Los servicios eliminados ya no aparecen ni en HTML ni en traducciones.
- Los datos de contacto visibles son los correctos.

## Notas de despliegue

- `vendor/` contenía `legal-core.css` y `legal-core.js` como soporte de la página legal.
- La versión actual de la web ya lleva ese contenido inline, así que `vendor/` no es obligatorio para que la home y `legal.html` funcionen.
- Aun así, conviene revisar en cada redeploy que no queden referencias antiguas a `vendor/...` ni archivos sueltos mezclados en `public_html`.
- El blog está separado de la web principal. Si `blog.sportmassagefuengirola.com` falla, revisar la carpeta raíz del subdominio en Hostinger; no depende de `public_html` tal como está ahora la web estática.
