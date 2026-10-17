# Sport Massage static Blogger deployment

The public blog is generated HTML. The editor service only writes source content and rebuilds that static tree; the public site does not depend on the editor being online.

## Activation gates

Keep Blogger disabled in Studio until all of these checks pass over HTTPS:

1. Mount `content/blog`, `content/blog/media`, and `.blogger-state` on persistent storage owned by the service account.
2. Fill every required `BLOGGER_*` value in a protected environment file. Use independent strong session and handoff secrets.
3. Configure Studio to exchange one-time codes for the exact audience `sportmassagefuengirola`.
4. Route `/admin/blogger/` and `/api/` to the service without exposing its loopback port directly.
5. Confirm `GET /api/blogger/health` and `GET /.well-known/wf-blogger.json` return the public capability contract without credentials, paths, launch codes, or analytics identifiers.
6. Verify direct login grants only the `blogger` scope, Studio launch records the `studio` audit origin, and logout invalidates the session.
7. Publish and unpublish a fixture post, then force a build failure and confirm source/public rollback before using real content.

If any check fails, keep the Studio tool disabled. Do not weaken origin checks or put secrets in static files.

## Content and recovery

Back up the persistent `content/blog` and `.blogger-state/audit.ndjson` paths. Generated `blog/` files are reproducible with `npm run build:blog`; source content is not. All publish/unpublish operations use a single writer, an atomic source update, a bounded build timeout, and restoration of the prior public tree on failure.

After an interrupted deployment, check for `.blogger-state/transaction`. Do not publish more content until the previous source/public backup has been reviewed and either restored or intentionally removed. Normal handled failures remove the transaction directory automatically.

## Analytics gate

`UMAMI_WEBSITE_ID` and `UMAMI_SCRIPT_URL` must stay empty until a real Sport Massage site UUID and HTTPS collector URL are available. An absent or malformed ID emits no tracker. After activation, verify collection and the legal copy before enabling analytics reporting in Studio.

## Service commands

```sh
npm test
npm run build:blog
npm run start:blogger
```

Use the examples in `deploy/` as templates. Replace paths and the service account for the target host; do not commit the production environment file.
