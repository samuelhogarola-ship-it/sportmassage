# Content Language Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emitir eventos Umami `page-language:es|en|fi` según el idioma de contenido realmente visible.

**Architecture:** Un activo JavaScript compartido observa el atributo `lang`, normaliza solo los tres idiomas soportados y deduplica por página. Las páginas fuente y el generador del blog cargan ese activo. Antes de subir el árbol estático sin regenerar artículos, GitHub Pages inyecta el tracker Umami cookie-free con la configuración pública verificada.

**Tech Stack:** HTML estático, JavaScript de navegador, Node.js 22 test runner.

**Spec:** `docs/superpowers/specs/2026-10-27-content-language-analytics-design.md`

## Global Constraints

- Evento exacto `page-language:<code>`.
- Sin PII, sin inferencia desde navegador y sin cargar un tracker alternativo.
- Sin publicar artículos ni desplegar.

## Review Focus

- La carga y una selección repetida no duplican eventos.
- Un cambio ES → EN → FI produce exactamente tres eventos.
- Códigos regionales se agregan a su base; códigos ajenos se ignoran.
- La ausencia o bloqueo de Umami no rompe la página.
- Los artículos conservan su `<html lang>` editorial.

### Task 1: Contrato compartido de medición

**Files:**
- Create: `language-analytics.js`
- Create: `tests/language-analytics.test.mjs`

- [ ] Escribir pruebas fallidas para carga, cambio, deduplicación, variantes regionales y ausencia del tracker.
- [ ] Implementar el helper mínimo y ejecutar la prueba focalizada.

### Task 2: Integración estática y Blogger

**Files:**
- Modify: `deploy/public-manifest.json`
- Modify: `index.html`
- Modify: `legal.html`
- Modify: `scripts/generate-blog.mjs`
- Modify: `blog/index.html`
- Modify: `tests/site-integration.test.mjs`
- Modify: `tests/generate-blog.test.mjs`
- Modify: `tests/review-round-1-build.test.mjs`

- [ ] Escribir pruebas fallidas para carga del helper en páginas fuente, release y blog generado.
- [ ] Integrar el activo sin alterar la puerta Umami ni publicar contenido.
- [ ] Ejecutar test completo, source check y build estático.

### Task 3: Activación real en GitHub Pages

**Files:**
- Create: `scripts/prepare-pages-analytics.mjs`
- Modify: `.github/workflows/pages.yml`
- Modify: `package.json`
- Modify: `tests/language-analytics.test.mjs`

- [ ] Probar que la preparación inyecta solo el tracker verificado, actualiza el aviso legal y excluye `/admin`.
- [ ] Ejecutar la preparación en el checkout efímero antes de `upload-pages-artifact`, conservando `path: .` y todos los artículos existentes.
