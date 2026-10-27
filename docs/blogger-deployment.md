# Sport Massage static Blogger deployment

The public blog is generated HTML. The editor service only writes source content and rebuilds that static tree; the public site does not depend on the editor being online.

## Activation gates

Do not announce the independent Blogger access until all of these checks pass over HTTPS:

1. Mount `content/blog`, `content/blog/media`, and `.blogger-state` on persistent storage owned by the service account with shared group `www-data`. Directories are `0750`, generated files are `0640`, and the service runs with `UMask=0027`, so Nginx can traverse/read releases without write access.
2. Fill the required values in protected Coolify environment variables: `BLOGGER_PUBLIC_ORIGIN`, `BLOGGER_DIRECT_USERNAME`, `BLOGGER_DIRECT_PASSWORD_HASH`, and a strong random `BLOGGER_SESSION_SECRET`. Set `BLOGGER_STUDIO_HANDOFF_ENABLED=false`. Do not configure a Studio exchange URL or handoff secret. Never store the plain Blogger password. Generate its scrypt hash through standard input so the password does not appear in process arguments or shell history:

   ```sh
   read -s BLOGGER_PASSWORD
   export BLOGGER_PASSWORD
   printf '%s' "$BLOGGER_PASSWORD" | node scripts/generate-blogger-password-hash.mjs
   unset BLOGGER_PASSWORD
   ```

   Store the printed hash as `BLOGGER_DIRECT_PASSWORD_HASH` in the protected environment file.
   The normal session lasts `BLOGGER_SESSION_TTL_SECONDS` (eight hours by default). “Recordarme” is opt-in and uses `BLOGGER_REMEMBERED_SESSION_TTL_SECONDS` (30 days by default, capped at 90 days). Rotate `BLOGGER_SESSION_SECRET` whenever every remembered session must be invalidated.
3. Serve the public site and `/admin/blogger/` from the generated `.blogger-state/public/current` release, and route `/api/` plus `/admin/blogger/login` to the sidecar without exposing its loopback port directly. The generated admin entry is the independent same-origin login shell; it must not redirect to Web Fuengirola Studio.
4. Confirm `GET /.well-known/wf-blogger.json` returns discovery capabilities and `GET /api/blogger/health` returns `200` with redacted boolean checks. Health intentionally returns `503` when there is no active release, content/state permissions are unusable, or transaction recovery remains unresolved. Neither response contains credentials, paths, launch codes, or analytics identifiers.
5. Verify direct login creates only the fixed `sportmassagefuengirola` / `blogger` session, `/admin/blogger/launch` returns 404, and logout invalidates the session.
6. In a separate staging checkout with disposable fixture content, publish and unpublish a fixture post, then force a build failure and confirm source/public rollback. Never run this recovery drill against the production article dataset; the production activation smoke test is read-only.

If any check fails, keep the direct endpoint private. Do not weaken origin checks or put secrets in static files.

## Content and recovery

Back up the persistent `content/blog` and `.blogger-state/audit.ndjson` paths. Public output is generated into immutable directories under `.blogger-state/public/releases`; `.blogger-state/public/current` is an atomically replaced symlink to the active release. Source content is not reproducible and must be backed up. Create, edit, status, delete, media and manual-build mutations all use the process-wide `.blogger-state/writer.lock`; `npm run build:site` uses that same lock. A dead-owner lock can be retired only after the stale interval. The isolated build child receives an allowlisted environment and is terminated and awaited on timeout before rollback completes.

Each mutation snapshots content and writes `.blogger-state/transaction/journal.json` before changing source. On startup, a journal whose release is not active validates the complete snapshot before atomically restoring source and removing the incomplete release. If the atomic `current` switch already happened, startup accepts that release and removes the journal. Release IDs, pointer targets, journal phases, and all copied/writable trees are constrained; symlinks and non-regular files are rejected. Post-activation cleanup is maintenance only and can never re-enter rollback. Preserve the transaction directory for diagnosis if startup reports a malformed journal.

## Analytics gate

`UMAMI_WEBSITE_ID` and `UMAMI_SCRIPT_URL` must stay empty until a real Sport Massage site UUID and HTTPS collector URL are available. Independently keep `UMAMI_PRODUCTION_VERIFIED=false`. Verify the production collector and site registration out of band, review the legal copy, and only then set the gate to `true`. The generator injects the tracker across public HTML only when the UUID, HTTPS URL, and verification gate all pass; admin HTML is excluded.

`/admin/blogger/` is the stable, independent entry point. Its username and password belong only to the Sport Massage Blogger tool. No launch code, portal session, Studio SSO, or secret is embedded in the generated site.

## Site identity compatibility

The existing `.web-core/site.json` registry and panel route keep the historical `sportmassage` key. Blogger uses `sportmassagefuengirola` as its fixed runtime site identity, with `sportmassage` retained only as a discovery/configuration alias. Every authenticated content endpoint requires the exact direct session claims for that site and the single `blogger` scope.

## Owner-only credential reset

Sofía cannot recover, change, or reset this password from the browser. The Blogger service intentionally exposes no recovery endpoint, and the portal password/reset flows are unrelated to this separate tool credential. Only the owner may rotate it from the protected deployment environment:

1. Read the authorized new value from the password manager into standard input.
2. Generate a new scrypt hash locally; never place plaintext in shell history:

   ```sh
   read -rs BLOGGER_PASSWORD
   printf '%s' "$BLOGGER_PASSWORD" | node scripts/generate-blogger-password-hash.mjs
   unset BLOGGER_PASSWORD
   ```

3. In protected Coolify variables, update `BLOGGER_DIRECT_PASSWORD_HASH` and rotate `BLOGGER_SESSION_SECRET` to a new strong random value. Rotating the session secret invalidates every existing Blogger cookie.
4. Restart only the Blogger sidecar. Confirm an old cookie receives `401`, then confirm the new direct login succeeds at `https://sportmassagefuengirola.com/admin/blogger/`.

Never send the hash, session secret, or plaintext password through the client portal, a ticket, source control, or a static file.

## Generated blog and verification

`scripts/generate-blog.mjs` owns the public blog HTML, including the current bilingual index design. Treat the committed `blog/index.html` as a generated preview; update the generator and its tests instead of hand-editing generated output. The release manifest follows the current `origin/main` proposal assets so a full static build cannot silently publish stale design files.

Pull requests run `npm test`, `npm run check`, and `npm run build:site` in CI. The source check also rejects tracked legacy CMS routes/references and archive files so the static Blogger flow cannot drift back to the retired publishing path.

## Service commands

```sh
npm test
npm run build:site
npm run start:blogger
```

Run `npm run build:site` once before starting or reloading Nginx. It uses the same isolated builder, versioned release directory, transaction journal, and atomic `current` pointer as authenticated publishing. `npm run build:blog` is only a checkout preview of `/blog/`; it does not create the public release tree served by Nginx.

Public release inputs are allowlisted in `deploy/public-manifest.json`; do not replace it with recursive copying. Bootstrap validates required `index.html`, `legal.html`, `blog/index.html`, referenced static assets, regular-file types, and release modes before activation.

Before launch, provision permissions explicitly (adjust the checkout path only):

```sh
chown -R sportmassage:www-data /srv/sportmassage/current/content/blog /srv/sportmassage/current/.blogger-state
find /srv/sportmassage/current/content/blog /srv/sportmassage/current/.blogger-state -type d -exec chmod 0750 {} +
find /srv/sportmassage/current/content/blog /srv/sportmassage/current/.blogger-state -type f -exec chmod 0640 {} +
```

Use the examples in `deploy/` as templates. Replace paths and the service account for the target host; do not commit the production environment file.
