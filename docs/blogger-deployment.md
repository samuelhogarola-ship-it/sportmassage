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

`UMAMI_WEBSITE_ID` and `UMAMI_SCRIPT_URL` remain independent of Blogger access and must stay empty until the production analytics configuration has been verified.
