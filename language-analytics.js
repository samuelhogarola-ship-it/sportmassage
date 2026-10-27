(function () {
  'use strict';

  var supported = { es: true, en: true, fi: true };
  var lastTracked = null;
  var pending = null;

  function normalize(value) {
    var code = String(value || '').trim().toLowerCase().split('-')[0];
    return supported[code] ? code : null;
  }

  function flush() {
    if (!pending || pending === lastTracked) return;
    if (!window.umami || typeof window.umami.track !== 'function') return;
    window.umami.track('page-language:' + pending);
    lastTracked = pending;
    pending = null;
  }

  function capture() {
    var language = normalize(document.documentElement.getAttribute('lang'));
    if (!language || language === lastTracked || language === pending) return;
    pending = language;
    flush();
  }

  new MutationObserver(capture).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['lang']
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', capture, { once: true });
  } else {
    capture();
  }
  window.addEventListener('load', flush, { once: true });
})();
