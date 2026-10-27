(function () {
  'use strict';

  var config = document.currentScript;
  var started = false;
  if (!config) return;

  function rejected() {
    try {
      return window.localStorage && window.localStorage.getItem('smf-cookie-consent') === 'rejected';
    } catch (_) {
      return false;
    }
  }

  function start() {
    if (started || rejected()) return;
    var websiteId = config.getAttribute('data-website-id');
    var scriptUrl = config.getAttribute('data-script-url');
    if (!websiteId || !scriptUrl || !/^https:\/\//i.test(scriptUrl)) return;
    started = true;
    var tracker = document.createElement('script');
    tracker.src = scriptUrl;
    tracker.setAttribute('data-website-id', websiteId);
    tracker.setAttribute('data-do-not-track', 'true');
    tracker.addEventListener('load', function () {
      window.dispatchEvent(new Event('umami:ready'));
    }, { once: true });
    document.head.appendChild(tracker);
  }

  window.addEventListener('smf:cookie-consent', function (event) {
    if (event && event.detail === 'accepted') start();
  });
  window.addEventListener('storage', function (event) {
    if (event && event.key === 'smf-cookie-consent' && event.newValue === 'accepted') start();
  });
  start();
})();
