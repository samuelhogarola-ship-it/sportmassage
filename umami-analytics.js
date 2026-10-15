/* Anonymous, cookieless Umami tracking for Sport Massage. */
(function () {
  'use strict';

  var PERSONAL_HOST = 'https://analytics.187.124.55.36.sslip.io';
  var WEBSITE_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
  var ready = null;

  function installTracker(config) {
    var existingTracker = document.querySelector('script[data-umami-tracker="true"]');
    if (existingTracker) return existingTracker;
    if (!config || config.hostUrl !== PERSONAL_HOST) return null;

    var websiteId = typeof config.websiteId === 'string'
      ? config.websiteId.trim()
      : '';
    if (!WEBSITE_ID_PATTERN.test(websiteId)) return null;

    var tracker = document.createElement('script');
    tracker.defer = true;
    tracker.dataset.domains = 'sportmassagefuengirola.com,www.sportmassagefuengirola.com';
    tracker.dataset.hostUrl = PERSONAL_HOST;
    tracker.dataset.umamiTracker = 'true';
    tracker.dataset.websiteId = websiteId;
    tracker.src = PERSONAL_HOST + '/script.js';
    document.head.appendChild(tracker);
    return tracker;
  }

  function init() {
    if (ready) return ready;
    if (typeof fetch !== 'function') return Promise.resolve(null);

    ready = fetch('/umami-config.json', {
      cache: 'no-store',
      credentials: 'same-origin'
    })
      .then(function (response) {
        return response && response.ok ? response.json() : null;
      })
      .then(installTracker)
      .catch(function () { return null; });

    return ready;
  }

  window.SportMassageUmami = { init: init };
  window.SportMassageUmami.ready = init();
})();
