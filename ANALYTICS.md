# Analytics deployment

The public root `umami-config.json` identifies Sport Massage on the personal Umami host. `umami-analytics.js` loads the tracker only for a valid config and never loads Google Analytics.

Static routes `index.html` and `legal.html` load this script. For the WordPress blog, copy `wordpress-mu-plugins/wf-umami.php` to `blog/wp-content/mu-plugins/wf-umami.php`. This frontend-only hook loads the same root script; it does not change the active theme or other plugins.

On existing hosting, preserve live content: upload the two analytics assets, add the script tag to live HTML, and add the new MU plugin. Do not replace a complete older live site with this source snapshot.

Run `node --test tests/umami.test.mjs`. Verify public static and blog pages emit one tracker and that the personal Umami instance receives pageviews. PHP syntax/runtime verification requires a PHP/WordPress environment; no PHP interpreter was available locally.
