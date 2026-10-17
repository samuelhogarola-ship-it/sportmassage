# Sport Massage static Blogger deployment

The public blog is generated HTML. The editor service only writes source content and rebuilds that static tree; the public site does not depend on the editor being online.

## Activation gates

Keep Blogger disabled in Studio until all of these checks pass over HTTPS:

1. Mount `content/blog`, `content/blog/media`, and `.blogger-state` on persistent storage owned by the service account.
2. Fill every required `BLOGGER_*` value in a protected environment file. Use independent strong session and handoff secrets.
3. Configure Studio to exchange one-time codes for the exact audience `sportmassagefuengirola`.
4. Serve the public site from `.blogger-state/public/current`, serve `/admin/blogger/` from the checkout, and route `/api/` to the service without exposing its loopback port directly.
5. Confirm `GET /api/blogger/health` and `GET /.well-known/wf-blogger.json` return the public capability contract without credentials, paths, launch codes, or analytics identifiers.
6. Verify direct login grants only the `blogger` scope, Studio launch records the `studio` audit origin, and logout invalidates the session.
7. Publish and unpublish a fixture post, then force a build failure and confirm source/public rollback before using real content.

If any check fails, keep the Studio tool disabled. Do not weaken origin checks or put secrets in static files.

## Content and recovery

Back up the persistent `content/blog` and `.blogger-state/audit.ndjson` paths. Public output is generated into immutable directories under `.blogger-state/public/releases`; `.blogger-state/public/current` is an atomically replaced symlink to the active release. Source content is not reproducible and must be backed up. Create, edit, status, delete, media and manual-build mutations all use one writer. The isolated build child is terminated and awaited on timeout before rollback completes.

Each mutation snapshots content and writes `.blogger-state/transaction/journal.json` before changing source. On startup, a journal whose release is not active restores the source snapshot and removes the incomplete release. If the atomic `current` switch already happened, startup accepts that release and removes the journal. This makes recovery deterministic across crashes before or after activation; preserve the transaction directory for diagnosis if startup reports a malformed journal.

## Analytics gate

`UMAMI_WEBSITE_ID` and `UMAMI_SCRIPT_URL` must stay empty until a real Sport Massage site UUID and HTTPS collector URL are available. Independently keep `UMAMI_PRODUCTION_VERIFIED=false`. Verify the production collector and site registration out of band, review the legal copy, and only then set the gate to `true`. The generator injects the tracker across public HTML only when the UUID, HTTPS URL, and verification gate all pass; admin HTML is excluded.

Studio launch URLs must put the one-time code in the fragment (`/admin/blogger/#code=...`). Fragments are not sent in HTTP request targets. The browser removes the fragment and exchanges the code in a same-origin POST body.

## Service commands

```sh
npm test
npm run build:blog
npm run start:blogger
```

Use the examples in `deploy/` as templates. Replace paths and the service account for the target host; do not commit the production environment file.
