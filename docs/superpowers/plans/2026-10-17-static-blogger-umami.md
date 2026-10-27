# Sport Massage Static Blogger and Umami Plan

> Superseded for authentication and editing. Sport Massage now uses only the static gateway to the existing central editor documented in `docs/blogger-deployment.md`; the website-local sidecar described below must not be restored or deployed.

**Goal:** Replace the removed legacy CMS blog with a fully static Sport Massage blog managed through a protected Blogger editor, while preparing privacy-friendly Umami analytics.

**Architecture:** A small Node service owns authenticated editing and deterministic static generation. Public pages remain plain generated HTML. Studio launches use the shared one-time handoff contract; direct credentials create the same site-local session but grant Blogger only. Umami markup is emitted only when a real website ID is configured.

## Global Constraints

- Never restore or depend on the legacy CMS, its APIs, themes, uploads, or credentials.
- Public `/blog/` and post URLs remain static and readable without the admin service.
- Studio handoff and direct Blogger credentials create equivalent site-local editor sessions with distinct audit origins.
- Direct Blogger credentials never grant Studio, billing, domain, hosting, reports, or cross-site access.
- Every mutation is serialized, path-confined, atomic, transactional with the generated public tree, and rollback-safe.
- Secrets, password hashes, launch codes, filesystem paths, and Umami website IDs are not exposed by health endpoints or logs.
- Blogger remains disabled in Studio until deployed HTTPS health and authentication checks pass.
- Umami tracking remains disabled until a valid Sport Massage website ID is supplied and production collection is verified.

### Task 1: Implement the Sport Massage static Blogger service

**Files:**
- Create: `package.json`, `.env.example`, `content/blog/`, `scripts/blog-content-store.mjs`, `scripts/generate-blog.mjs`, `scripts/blogger-launch-session.mjs`, `scripts/post-manager-server.mjs`, focused tests and deployment documentation/configuration.
- Modify: `admin/blogger/`, `blog/index.html`, public legal/privacy copy, and relevant static pages for optional Umami injection.

**Interfaces:**
- Consume Studio `POST /api/tool-launch/exchange` using audience `sportmassagefuengirola`.
- Produce `POST /admin/blogger/launch`, direct Blogger-only login, `GET /api/admin/session`, `POST /api/admin/logout`, `GET /.well-known/wf-blogger.json`, `GET /api/blogger/health`, protected CRUD/media/build endpoints, and deterministic static `/blog/` output.

- [ ] Write and run failing tests first for direct auth scope, Studio handoff, secure bounded sessions, rate limits, anonymous mutation rejection, path confinement, image limits, single-writer mutations, transactional publish/unpublish, rollback, process timeout and secret-free health.
- [ ] Write and run failing generator tests for draft exclusion, stable URLs, escaped metadata/body, deterministic builds, optional valid Umami injection and no tracker when ID is absent or invalid.
- [ ] Implement the minimum service and content store required to pass the tests; preserve the existing editor UI and add the auth adapter/login surface it expects.
- [ ] Remove all remaining legacy-CMS-facing references and document migration/deployment without restoring a CMS.
- [ ] Run the full repository test/build/static parity suite and commit the coherent change on the dedicated branch.

### Task 2: Review and activation readiness

- [ ] Independently review the full branch for security, specification compliance, static-output parity and operational recovery.
- [ ] Fix Important/Critical findings with focused regression tests and re-review.
- [ ] Verify the deployed persistent content path, HTTPS health contract, direct-login flow, Studio handoff, public static blog, rollback and Umami collection before activation.
- [ ] Keep Studio Blogger and analytics inactive whenever a deployment prerequisite or real Umami website ID is missing.
