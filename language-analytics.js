(function () {
  'use strict';

  var supported = { es: true, en: true, fi: true };
  var lastTracked = null;
  var pending = null;
  var inFlight = null;

  function normalize(value) {
    var code = String(value || '').trim().toLowerCase().split('-')[0];
    return supported[code] ? code : null;
  }

  function flush() {
    if (!pending || inFlight || consentRejected()) return;
    if (pending === lastTracked) {
      pending = null;
      return;
    }
    if (!window.umami || typeof window.umami.track !== 'function') return;
    var language = pending;
    inFlight = language;
    var result;
    try {
      result = window.umami.track('page-language:' + language);
    } catch (_) {
      inFlight = null;
      return;
    }
    if (result && typeof result.then === 'function') {
      result.then(function () {
        if (inFlight === language) inFlight = null;
        lastTracked = language;
        if (pending === language) pending = null;
        flush();
      }, function () {
        if (inFlight === language) inFlight = null;
      });
      return;
    }
    inFlight = null;
    lastTracked = language;
    if (pending === language) pending = null;
    flush();
  }

  function consentRejected() {
    try {
      return window.localStorage && window.localStorage.getItem('smf-cookie-consent') === 'rejected';
    } catch (_) {
      return false;
    }
  }

  function capture() {
    var language = normalize(document.documentElement.getAttribute('lang'));
    if (!language) {
      pending = null;
      return;
    }
    if (language === lastTracked && !inFlight) {
      pending = null;
      return;
    }
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
  window.addEventListener('umami:ready', capture);
  window.addEventListener('smf:cookie-consent', function (event) {
    if (event && event.detail === 'accepted') capture();
    else if (event && event.detail === 'rejected') pending = null;
  });
})();
