/* cookie-banner-core.js — configurable consent banner engine
   Source: github.com/samuelhogarola-ship-it/core  branch: feature/cookie-banner-core
   Exposes window.CookieBannerCore.init(config)

   Config options:
     storageKey   {string}  localStorage key for the consent decision
     imageSrc     {string}  path to the banner image (optional)
     imageAlt     {string}  alt text for the image
     title        {string}  heading text
     noticeHtml   {string}  inner HTML for the notice paragraph area
     acceptLabel  {string}  label for the accept button
     rejectLabel  {string}  label for the reject button
     configLabel  {string}  label for the config/settings link
     policyUrl    {string}  href for the policy link inside noticeHtml
     configUrl    {string}  href for the config link in the footer
*/
(function () {
  'use strict';

  function init(cfg) {
    var key = cfg.storageKey || 'cookie_consent';

    if (localStorage.getItem(key)) return;

    var imgHtml = cfg.imageSrc
      ? '<div class="cookie-banner-img-container">' +
          '<img src="' + cfg.imageSrc + '" alt="' + (cfg.imageAlt || '') + '" class="cookie-banner-img">' +
        '</div>'
      : '';

    var html =
      '<div class="cookie-banner-wrapper">' +
        '<div class="cookie-banner-card">' +
          imgHtml +
          '<h2>' + (cfg.title || '') + '</h2>' +
          (cfg.noticeHtml || '') +
          '<div class="cookie-banner-buttons">' +
            '<button class="cb-reject cookie-btn btn-cookie-secondary">' + (cfg.rejectLabel || 'Rechazar') + '</button>' +
            '<button class="cb-accept cookie-btn btn-cookie-primary">' + (cfg.acceptLabel || 'Aceptar') + '</button>' +
          '</div>' +
          '<div class="cookie-banner-footer">' +
            '<a href="' + (cfg.configUrl || cfg.policyUrl || '#') + '" class="cookie-config-link">' +
              (cfg.configLabel || '') +
            '</a>' +
          '</div>' +
        '</div>' +
      '</div>';

    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    var wrapper = tmp.firstChild;
    document.body.appendChild(wrapper);
    wrapper.style.display = 'block';

    wrapper.querySelector('.cb-accept').addEventListener('click', function () {
      localStorage.setItem(key, 'accepted');
      wrapper.style.display = 'none';
    });

    wrapper.querySelector('.cb-reject').addEventListener('click', function () {
      localStorage.setItem(key, 'rejected');
      wrapper.style.display = 'none';
    });
  }

  window.CookieBannerCore = { init: init };
})();
