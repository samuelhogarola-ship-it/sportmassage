/*
 * legal-core.js — vendored from @lab-world/core src/legal.js
 *
 * TODO: when @lab-world/core is published to npm or available as a local
 *       package, replace this file with:
 *         import { createLegalPageMarkup } from '@lab-world/core/legal';
 *       and remove this vendor copy.
 *
 * Source: /Users/sam/Desktop/webs/LAB-WORLD/core/src/legal.js
 * Only the IIFE portion is included here (no ES-module exports),
 * so this file can be loaded as a plain <script> tag.
 * Exposes: window.LegalCore.createLegalPageMarkup(appConfig)
 */

(function (globalScope) {
  "use strict";

  /* ── HELPERS ────────────────────────────────────────────────── */
  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* Returns escaped value, or a highlighted [RELLENAR] span as fallback. */
  function field(value, placeholder) {
    if (value) return escapeHtml(value);
    return '<span class="legal-rellenar">' + escapeHtml(placeholder) + '</span>';
  }

  /* ── BOTTOM BAR (landing footer links) ──────────────────────── */
  function getBottomBarLinks(options) {
    var opts = options || {};
    return [
      { key: "metodologia", label: "Metodología", href: opts.metodologiaHref || "/metodologia" },
      { key: "contacto",    label: "Contacto",    href: opts.contactoHref    || "mailto:www.vokabellab@pm.me" },
      { key: "legal",       label: "Legal",       href: opts.legalHref       || "/legal" }
    ];
  }

  function createBottomBarMarkup(options) {
    var links = getBottomBarLinks(options);
    var parts = [];
    for (var i = 0; i < links.length; i += 1) {
      if (i > 0) parts.push('<span class="ln-sep">·</span>');
      parts.push(
        '<a class="ln-contact-btn" href="' + escapeHtml(links[i].href) + '">' +
          escapeHtml(links[i].label) +
        '</a>'
      );
    }
    return '<div class="ln-bottom-bar">' + parts.join("") + "</div>";
  }

  /* ── APP FOOTER (non-landing nav footer) ────────────────────── */
  function createAppFooterMarkup(options) {
    var opts    = options || {};
    var active  = opts.activeApp || "imkontext";
    var links   = [
      { key: "samuel",     label: "Samuel Coach de alemán", href: "https://www.samuelcoachdealeman.com/", external: true },
      { key: "vokabellab", label: "Vokabel Lab",            href: "https://www.vokabellab.com/",          external: true },
      { key: "derdiedas",  label: "der die das",            href: "https://derdiedas.vokabellab.com/",    external: true },
      { key: "imkontext",  label: "imKontext",              href: opts.imkontextHref || "#",               external: false }
    ];
    var parts = [];
    for (var i = 0; i < links.length; i += 1) {
      if (i > 0) parts.push('<span class="app-footer-sep">|</span>');
      var l        = links[i];
      var isActive = l.key === active;
      var cls      = isActive ? "app-footer-nav-link nav-active" : "app-footer-nav-link";
      var extAttrs = l.external ? ' target="_blank" rel="noreferrer"' : "";
      var dataAttr = isActive ? ' data-footer-active-link="' + escapeHtml(l.key) + '"' : "";
      parts.push(
        '<a href="' + escapeHtml(l.href) + '" class="' + cls + '"' + extAttrs + dataAttr + '>' +
          escapeHtml(l.label) +
        '</a>'
      );
    }
    return (
      '<footer id="app-footer" class="app-footer">' +
        '<nav class="app-footer-nav" aria-label="Navegación">' + parts.join("") + '</nav>' +
      '</footer>'
    );
  }

  /* ── LEGAL PAGE DATA ────────────────────────────────────────── */

  function getLegalSections() {
    return [
      {
        id: "aviso-legal",
        title: "1. Aviso Legal e Información Identificativa",
        intro:
          "En cumplimiento con el deber de información recogido en el artículo 10 de la Ley 34/2002, " +
          "de 11 de julio, de Servicios de la Sociedad de la Información y del Comercio Electrónico " +
          "(LSSI-CE), se facilitan a continuación los datos identificativos del titular de este sitio web.",
        identityRows: [
          { label: "Titular de la web", value: "[RELLENAR: nombre completo o razón social]" },
          { label: "NIF / CIF",         value: "[RELLENAR: DNI con letra o CIF de la empresa]" },
          { label: "Domicilio fiscal",  value: "[RELLENAR: dirección postal completa]" },
          { label: "Email de contacto", value: "[RELLENAR: email de contacto]" },
          { label: "Sitio web",         value: "[RELLENAR: URL del sitio]" }
        ],
        usageTitle: "Condiciones de uso",
        usageParagraphs: [
          "El acceso y uso de este sitio web atribuye al visitante la condición de usuario y supone " +
            "la aceptación plena de las presentes condiciones de uso. El usuario se compromete a hacer " +
            "un uso adecuado de los contenidos y servicios, sin emplearlos para actividades ilícitas " +
            "o contrarias a la buena fe, al orden público o a los derechos de terceros.",
          "Los contenidos de este sitio web —textos, imágenes, diseño y código— son propiedad del " +
            "titular o cuentan con la debida autorización de uso. Queda prohibida su reproducción, " +
            "distribución o comunicación pública sin autorización expresa.",
          "El titular se reserva el derecho a modificar, suspender o dar de baja los contenidos " +
            "y servicios del sitio en cualquier momento, sin previo aviso."
        ]
      },
      {
        id: "privacidad",
        title: "2. Política de Privacidad y Protección de Datos",
        intro:
          "En cumplimiento del Reglamento (UE) 2016/679 del Parlamento Europeo y del Consejo " +
          "(RGPD) y de la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos " +
          "Personales y garantía de los derechos digitales (LOPDGDD), se informa al usuario " +
          "de la siguiente política de tratamiento de datos personales.",
        blocks: [
          {
            heading: "Responsable del tratamiento",
            paragraphs: [
              "[RELLENAR: nombre o razón social]\n" +
                "NIF / CIF: [RELLENAR]\n" +
                "Email: [RELLENAR: email de contacto]"
            ]
          }
        ]
      },
      {
        id: "cookies",
        title: "3. Política de Cookies"
      },
      {
        id: "actualizaciones",
        title: "4. Actualizaciones de esta Política",
        paragraphs: [
          "Esta política puede ser modificada en función de cambios legislativos o de nuevas " +
            "funcionalidades incorporadas al servicio. Se recomienda revisarla periódicamente.",
          "Última actualización: [RELLENAR: fecha]."
        ]
      }
    ];
  }

  /* ── LEGAL PAGE RENDERER ────────────────────────────────────── */

  function createLegalPageMarkup(appConfig) {
    var cfg = appConfig || {};

    var appName         = cfg.appName         || "";
    var legalTitle      = cfg.legalTitle      || "Información Legal";
    var legalIntro      = cfg.legalIntro      || null;
    var ownerName       = field(cfg.ownerName,      "[RELLENAR: nombre completo o razón social]");
    var ownerNif        = field(cfg.ownerNif,       "[RELLENAR: DNI con letra o CIF de la empresa]");
    var ownerAddress    = field(cfg.ownerAddress,   "[RELLENAR: dirección postal completa]");
    var contactEmail    = field(cfg.contactEmail,   "[RELLENAR: email de contacto]");
    var siteUrl         = field(cfg.siteUrl,        "[RELLENAR: URL del sitio]");
    var hostingProvider = field(cfg.hostingProvider,"[RELLENAR: proveedor de hosting o email]");
    var lastUpdated     = escapeHtml(cfg.lastUpdated || "mayo de 2026");
    var extraSections   = cfg.extraSections || [];

    var h = "";

    /* — Kicker + title + intro — */
    if (appName) {
      h += '<p class="legal-kicker">' + escapeHtml(appName) + '</p>';
    }
    h += '<h1 class="legal-title">' + escapeHtml(legalTitle) + '</h1>';
    if (legalIntro) {
      h += '<p class="legal-intro">' + escapeHtml(legalIntro) + '</p>';
    }

    /* — Index nav — */
    var indexItems = [
      { href: "#aviso-legal",     label: "1. Aviso Legal e Información Identificativa" },
      { href: "#privacidad",      label: "2. Política de Privacidad y Protección de Datos" },
      { href: "#cookies",         label: "3. Política de Cookies" },
      { href: "#actualizaciones", label: "4. Actualizaciones de esta Política" }
    ];
    for (var xi = 0; xi < extraSections.length; xi++) {
      var xs = extraSections[xi];
      if (xs.id && xs.title) {
        indexItems.push({ href: "#" + xs.id, label: (indexItems.length + 1) + ". " + xs.title });
      }
    }
    h += '<nav class="legal-index" aria-label="Índice de secciones legales">';
    h += '<p>Contenido de esta página</p><ol>';
    for (var ii = 0; ii < indexItems.length; ii++) {
      h += '<li><a href="' + indexItems[ii].href + '">' + escapeHtml(indexItems[ii].label) + '</a></li>';
    }
    h += '</ol></nav>';

    /* ── SECTION 1: Aviso Legal ─────────────────────────────── */
    h += '<section class="legal-section" id="aviso-legal">';
    h += '<h2>1. Aviso Legal e Información Identificativa</h2>';
    h += '<p>En cumplimiento con el deber de información recogido en el artículo 10 de la Ley 34/2002, ' +
         'de 11 de julio, de Servicios de la Sociedad de la Información y del Comercio Electrónico ' +
         '(LSSI-CE), se facilitan a continuación los datos identificativos del titular de este sitio web.</p>';

    h += '<table class="legal-table">';
    var identityRows = [
      ["Titular de la web",  ownerName],
      ["NIF / CIF",          ownerNif],
      ["Domicilio fiscal",   ownerAddress],
      ["Email de contacto",  contactEmail],
      ["Sitio web",          siteUrl]
    ];
    for (var ir = 0; ir < identityRows.length; ir++) {
      h += '<tr><td>' + escapeHtml(identityRows[ir][0]) + '</td><td>' + identityRows[ir][1] + '</td></tr>';
    }
    h += '</table>';

    h += '<h3>Condiciones de uso</h3>';
    h += '<p>El acceso y uso de este sitio web atribuye al visitante la condición de usuario y supone ' +
         'la aceptación plena de las presentes condiciones de uso. El usuario se compromete a hacer ' +
         'un uso adecuado de los contenidos y servicios, sin emplearlos para actividades ilícitas ' +
         'o contrarias a la buena fe, al orden público o a los derechos de terceros.</p>';
    h += '<p>Los contenidos de este sitio web —textos, imágenes, diseño y código— son propiedad del ' +
         'titular o cuentan con la debida autorización de uso. Queda prohibida su reproducción, ' +
         'distribución o comunicación pública sin autorización expresa.</p>';
    h += '<p>El titular se reserva el derecho a modificar, suspender o dar de baja los contenidos ' +
         'y servicios del sitio en cualquier momento, sin previo aviso.</p>';
    h += '</section>';

    /* ── SECTION 2: Privacidad ──────────────────────────────── */
    h += '<section class="legal-section" id="privacidad">';
    h += '<h2>2. Política de Privacidad y Protección de Datos</h2>';
    h += '<p>En cumplimiento del Reglamento (UE) 2016/679 del Parlamento Europeo y del Consejo ' +
         '(RGPD) y de la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos ' +
         'Personales y garantía de los derechos digitales (LOPDGDD), se informa al usuario ' +
         'de la siguiente política de tratamiento de datos personales.</p>';

    h += '<h3>Responsable del tratamiento</h3>';
    h += '<p>' + ownerName + '<br>NIF / CIF: ' + ownerNif + '<br>Email: ' + contactEmail + '</p>';

    h += '<h3>Finalidad del tratamiento</h3>';
    h += '<p>Los datos personales que pudieran recogerse a través del formulario de contacto ' +
         'o del correo electrónico facilitado en esta web se utilizan exclusivamente para:</p>';
    h += '<ul>' +
           '<li>Responder a las consultas y mensajes enviados por el usuario.</li>' +
           '<li>Gestionar citas y solicitudes de reserva enviadas por el usuario.</li>' +
         '</ul>';
    h += '<p>No se realizan perfiles de usuario ni se toman decisiones automatizadas basadas en los datos facilitados.</p>';

    h += '<h3>Base de legitimación</h3>';
    h += '<p>El tratamiento de los datos se basa en el consentimiento del usuario, prestado de forma ' +
         'libre, específica, informada e inequívoca al enviar un mensaje de contacto o al solicitar ' +
         'información sobre los servicios ofrecidos.</p>';

    h += '<h3>Destinatarios</h3>';
    h += '<p>No se cederán datos personales a terceros, salvo obligación legal. Los datos se almacenan ' +
         'en los servidores de ' + hostingProvider + ', dentro del Espacio Económico Europeo.</p>';

    h += '<h3>Plazo de conservación</h3>';
    h += '<p>Los datos se conservarán durante el tiempo necesario para atender la solicitud del usuario ' +
         'y, posteriormente, durante los plazos legalmente establecidos para atender posibles ' +
         'responsabilidades derivadas del tratamiento.</p>';

    h += '<h3>Derechos del usuario</h3>';
    h += '<p>El usuario tiene derecho a acceder, rectificar, suprimir, oponerse, limitar y portar ' +
         'sus datos personales. Para ejercer cualquiera de estos derechos, puede enviar un correo ' +
         'a ' + contactEmail + ', indicando el derecho que desea ejercer y adjuntando una copia ' +
         'de su documento de identidad.</p>';
    h += '<p>Si considera que el tratamiento de sus datos no se ajusta a la normativa vigente, puede ' +
         'presentar una reclamación ante la Agencia Española de Protección de Datos (www.aepd.es).</p>';
    h += '</section>';

    /* ── SECTION 3: Cookies ─────────────────────────────────── */
    h += '<section class="legal-section" id="cookies">';
    h += '<h2>3. Política de Cookies</h2>';

    h += '<h3>¿Qué es una cookie?</h3>';
    h += '<p>Una cookie es un pequeño archivo de texto que un sitio web guarda en el navegador del ' +
         'usuario cuando este lo visita. Las cookies permiten que el sitio recuerde información ' +
         'sobre la visita, como las preferencias del usuario, lo que facilita la navegación y ' +
         'hace el servicio más útil.</p>';

    h += '<h3>Cookies utilizadas en este sitio</h3>';
    h += '<p>Este sitio web es de naturaleza informativa y no requiere inicio de sesión ni gestión ' +
         'de progreso. No se utilizan cookies propias de seguimiento ni analítica de terceros ' +
         '(como Google Analytics o píxeles de redes sociales).</p>';
    h += '<p>Si en el futuro se incorporaran cookies adicionales, esta política se actualizará y ' +
         'se solicitará el consentimiento del usuario antes de activarlas.</p>';

    h += '<h3>Cómo gestionar o desactivar las cookies</h3>';
    h += '<p>El usuario puede configurar su navegador para rechazar o borrar las cookies en cualquier ' +
         'momento. A continuación se indican los enlaces de ayuda de los navegadores más habituales:</p>';
    var browserLinks = [
      { label: "Google Chrome",   href: "https://support.google.com/chrome/answer/95647" },
      { label: "Mozilla Firefox", href: "https://support.mozilla.org/es/kb/habilitar-y-deshabilitar-cookies-sitios-web-rastrear-preferencias" },
      { label: "Safari",          href: "https://support.apple.com/es-es/guide/safari/sfri11471/mac" },
      { label: "Microsoft Edge",  href: "https://support.microsoft.com/es-es/windows/eliminar-y-administrar-cookies-168dab11-0753-043d-7c16-ede5947fc64d" }
    ];
    h += '<ul>';
    for (var bl = 0; bl < browserLinks.length; bl++) {
      h += '<li><a href="' + escapeHtml(browserLinks[bl].href) + '" target="_blank" rel="noreferrer">' +
             escapeHtml(browserLinks[bl].label) +
           '</a></li>';
    }
    h += '</ul>';
    h += '</section>';

    /* ── SECTION 4: Actualizaciones ─────────────────────────── */
    h += '<section class="legal-section" id="actualizaciones">';
    h += '<h2>4. Actualizaciones de esta Política</h2>';
    h += '<p>Esta política puede ser modificada en función de cambios legislativos o de nuevas ' +
         'funcionalidades incorporadas al servicio. Se recomienda revisarla periódicamente.</p>';
    h += '<p>Última actualización: ' + lastUpdated + '.</p>';
    h += '</section>';

    /* ── Extra sections ─────────────────────────────────────── */
    for (var ei = 0; ei < extraSections.length; ei++) {
      var es = extraSections[ei];
      if (es.id && es.title && es.html) {
        h += '<section class="legal-section" id="' + escapeHtml(es.id) + '">';
        h += '<h2>' + escapeHtml(es.title) + '</h2>';
        h += es.html;
        h += '</section>';
      }
    }

    return '<main class="legal-wrap">' + h + '</main>';
  }

  /* ── PUBLIC API ─────────────────────────────────────────────── */
  var api = {
    createBottomBarMarkup:  createBottomBarMarkup,
    createAppFooterMarkup:  createAppFooterMarkup,
    createLegalPageMarkup:  createLegalPageMarkup,
    getBottomBarLinks:      getBottomBarLinks,
    getLegalSections:       getLegalSections
  };

  globalScope.LegalCore = api;
  globalScope.LabWorldCore = globalScope.LabWorldCore || {};
  globalScope.LabWorldCore.LegalCore = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
