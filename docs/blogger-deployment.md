# Sport Massage Blogger gateway

`https://sportmassagefuengirola.com/admin/blogger/` is a static English gateway. It redirects to the existing central Blogger editor at:

`https://portal.webfuengirola.com/acceso/blogger/sportmassagefuengirola`

This website must not run a Blogger login service, session service, content API, credential store, or editor backend. It must not proxy `/api/admin`, `/api/blogger`, `/api/posts`, or `/api/build`. The independent Blogger credential and its session live only in the existing `wf-studio-panel` application on `portal.webfuengirola.com`.

The central editor keeps the established GitHub-backed publication flow for `samuelhogarola-ship-it/sportmassage`. The static website repository continues to contain public site and blog output, but it does not authenticate authors.

## Verification

Before deployment:

1. Run `npm test`, `npm run check`, and `npm run build:site`.
2. Verify the source and generated `/admin/blogger/index.html` contain the exact portal URL above.
3. Verify the gateway contains no form, password field, iframe, reference to `admin.webfuengirola.com`, or same-origin Blogger API.
4. Verify the repository contains no local Blogger server or service configuration.
5. Verify no article content changed as part of an access-only deployment.

The direct Blogger password is owner-managed in the existing central panel deployment. Sofía has no password recovery or password-change flow for this credential. Her ordinary client-panel password remains separate and may use the panel's normal recovery flow.

## Public static build

The public release remains generated from the explicit allowlist in `deploy/public-manifest.json`. `scripts/generate-blog.mjs` owns the public blog HTML. Treat the committed `blog/index.html` as generated output and update the generator and its tests instead of editing it by hand.

`UMAMI_WEBSITE_ID` and `UMAMI_SCRIPT_URL` remain independent of Blogger access and must only be activated after the production analytics configuration has been verified.

## Content-language analytics

Every public page loads `/language-analytics.js`. The helper reads the language of the content from the root `<html lang>` attribute and, when the existing Umami tracker is available, emits one of these named events:

- `page-language:es`
- `page-language:en`
- `page-language:fi`

Regional variants are normalized to their base language, repeated observations of the same language are deduplicated, and unsupported language codes are ignored. The event carries no custom payload, URL, account value, or other personal data. The helper does not load Umami and remains inert while the existing production analytics gate is disabled.

The GitHub Pages workflow activates the existing cookie-free tracker only in its ephemeral upload tree, using Sport Massage's verified public website ID and HTTPS script URL; `/admin` is excluded. This preserves every committed article and updates the deployed disclosure to the active-analytics wording without rewriting source content.

The home page changes its root `lang` value whenever the visitor changes the displayed language, so the event represents content actually shown rather than browser preference. Generated blog pages include the same helper in their template, while already-published static blog output is updated in place without regenerating or publishing articles.
