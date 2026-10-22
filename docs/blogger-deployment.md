# Sport Massage static Blogger deployment

The public blog is generated HTML. The editor service only writes source content and rebuilds that static tree; the public site does not depend on the editor being online.

## Activation gates

Keep Blogger disabled in Studio until all of these checks pass over HTTPS:

1. Mount `content/blog`, `content/blog/media`, and `.blogger-state` on persistent storage owned by the service account with shared group `www-data`. Directories are `0750`, generated files are `0640`, and the service runs with `UMask=0027`, so Nginx can traverse/read releases without write access.
2. Fill every required `BLOGGER_*` value in a protected environment file. Set `BLOGGER_DIRECT_USERNAME=sportsmassage`, generate `BLOGGER_DIRECT_PASSWORD_HASH` from the operator-supplied password with `node scripts/generate-blogger-password-hash.mjs` reading standard input, and use independent strong session and handoff secrets. Never place the plaintext password in a command argument, source file, documentation, log, or test fixture.
3. Configure Studio to exchange one-time codes for the exact audience `sportmassagefuengirola`.
4. Serve the public site and the independent Sport Massage editor at `/admin/blogger/` from the generated `.blogger-state/public/current` release, and route `/api/` plus the two admin authentication endpoints to the service without exposing its loopback port directly. Releases copy only the editor files allowlisted in `deploy/public-manifest.json`; never serve the checkout directly.
5. Confirm `GET /.well-known/wf-blogger.json` returns discovery capabilities and `GET /api/blogger/health` returns `200` with redacted boolean checks. Health intentionally returns `503` when there is no active release, content/state permissions are unusable, or transaction recovery remains unresolved. Neither response contains credentials, paths, launch codes, or analytics identifiers.
6. Verify direct login grants only the `blogger` scope, Studio launch records the `studio` audit origin, and logout invalidates the session. Unchecked direct and Studio sessions remain short-lived and memory-only. Checked direct sessions use a 30-day cookie and a permission-restricted `.blogger-state/sessions.json` record that survives service restart.
7. Publish and unpublish a fixture post, then force a build failure and confirm source/public rollback before using real content.

If any check fails, keep the Studio tool disabled. Do not weaken origin checks or put secrets in static files.

## Content and recovery

Back up the persistent `content/blog`, `.blogger-state/audit.ndjson`, and `.blogger-state/sessions.json` paths. The session file contains only random identifiers and session metadata, is atomically replaced with mode `0600`, is bounded, and prunes expired records; it never stores credentials or complete signed cookie tokens. Public output is generated into immutable directories under `.blogger-state/public/releases`; `.blogger-state/public/current` is an atomically replaced symlink to the active release. Source content is not reproducible and must be backed up. Create, edit, status, delete, media and manual-build mutations all use the process-wide `.blogger-state/writer.lock`; `npm run build:site` uses that same lock. A dead-owner lock can be retired only after the stale interval. The isolated build child receives an allowlisted environment and is terminated and awaited on timeout before rollback completes.

Each mutation snapshots content and writes `.blogger-state/transaction/journal.json` before changing source. On startup, a journal whose release is not active validates the complete snapshot before atomically restoring source and removing the incomplete release. If the atomic `current` switch already happened, startup accepts that release and removes the journal. Release IDs, pointer targets, journal phases, and all copied/writable trees are constrained; symlinks and non-regular files are rejected. Post-activation cleanup is maintenance only and can never re-enter rollback. Preserve the transaction directory for diagnosis if startup reports a malformed journal.

## Analytics gate

`UMAMI_WEBSITE_ID` and `UMAMI_SCRIPT_URL` must stay empty until a real Sport Massage site UUID and HTTPS collector URL are available. Independently keep `UMAMI_PRODUCTION_VERIFIED=false`. Verify the production collector and site registration out of band, review the legal copy, and only then set the gate to `true`. The generator injects the tracker across public HTML only when the UUID, HTTPS URL, and verification gate all pass; admin HTML is excluded.

`/admin/blogger/` is the stable independent Sport Massage editor. Operators can sign in directly with the configured username and password, while Studio/client-portal entry continues to consume the existing `wf-blogger-handoff/v1` exchange without knowing the direct password. Credentials remain in password-manager-compatible form fields and are sent only to the same-origin login endpoint; JavaScript, local storage, generated releases, and source files never store them. No launch code or secret is embedded in the generated site.

## Site identity compatibility

The existing `.web-core/site.json` registry and panel route keep the historical `sportmassage` key. Blogger declares `sportmassagefuengirola` separately as its canonical Studio tenant and handoff audience, with `sportmassage` listed only as a discovery/configuration alias. Authentication remains fail-closed: the runtime sends and accepts only the canonical `sportmassagefuengirola` audience during the one-time Studio exchange.

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
