# Public Website and Downloads

## Scope

Phase 37 public marketing site, SEO surfaces, and trusted desktop release presentation in `@polivo/web`.

This document is operator guidance for publication and launch dependencies. It does not claim installers, legal copy, or support contacts were created by repository changes alone.

## Public route map

| Path                                                                       | Purpose                                    | Indexed |
| -------------------------------------------------------------------------- | ------------------------------------------ | ------- |
| `/`                                                                        | Home                                       | Yes     |
| `/features`                                                                | Implemented capabilities                   | Yes     |
| `/how-it-works`                                                            | Host / terminal / cloud model              | Yes     |
| `/downloads`                                                               | Release presentation                       | Yes     |
| `/setup`                                                                   | Public setup guide                         | Yes     |
| `/support`                                                                 | Setup troubleshooting                      | Yes     |
| `/privacy`                                                                 | Privacy placeholder pending legal approval | Yes     |
| `/terms`                                                                   | Terms placeholder pending legal approval   | Yes     |
| `/sign-in`, `/sign-up`                                                     | Clerk auth                                 | No      |
| `/dashboard`, `/onboarding`, `/tenants/*`, `/invitations/*`, `/platform/*` | Authenticated app                          | No      |
| `/api/downloads/[releaseId]`                                               | Trusted download redirect                  | No      |

Authenticated navigation remains in `AppShell`. Public navigation uses `PublicSiteShell`.

## Release catalog

- Contracts: `@polivo/contracts` `releases.ts`
- Catalog source: [`apps/web/src/lib/releases/catalog.ts`](../../apps/web/src/lib/releases/catalog.ts) (version-controlled)
- Resolver: [`apps/web/src/lib/releases/resolve-download.ts`](../../apps/web/src/lib/releases/resolve-download.ts)
- Redirect: `GET /api/downloads/[releaseId]`

Publication states: `planned`, `available_test`, `available_production`, `withdrawn`.

Rules:

1. Planned releases never produce active download buttons.
2. Download destinations must be HTTPS on hosts listed in `POLIVO_RELEASE_DOWNLOAD_ORIGINS`.
3. Client query parameters never supply artifact URLs.
4. Checksums verify integrity; they are not publisher identity.
5. Signing status must reflect verification — do not mark production-ready from a metadata field alone.

Until Phase 44 packaging and Phase 45 signing produce verified artifacts, the shipped catalog is empty and `/downloads` shows: **Desktop downloads are not available yet.**

## Environment

| Variable                          | Role                                                      |
| --------------------------------- | --------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`             | Public origin for canonical URLs, Open Graph, and sitemap |
| `POLIVO_RELEASE_DOWNLOAD_ORIGINS` | Comma-separated approved download hostnames               |

## Publication and withdrawal procedure

1. Build and verify the installer through Phase 44/45 processes.
2. Add a catalog entry with real checksum, size, HTTPS URL, and accurate signing status.
3. Set `publicationState` to `available_test` or `available_production` only after verification.
4. Deploy the web app so the catalog ships with the site.
5. To withdraw: set `publicationState` to `withdrawn`, set `withdrawnAt` / `withdrawalReason`, redeploy. Redirects return 410.

Do not build a public release-upload UI in this phase.

## Integration points for later phases

| Phase | Consumes / produces                                                                                 |
| ----- | --------------------------------------------------------------------------------------------------- |
| 44    | Windows installer packaging and service lifecycle artifacts the catalog will list                   |
| 45    | Signing verification status and compatibility fields                                                |
| 46    | Deployment automation that may replace the hand-edited catalog with a reviewed publication pipeline |

## Public-launch dependencies (operator)

- Approved support contact details
- Approved privacy policy and terms of use
- Verified installer artifacts and download origins
- Production `NEXT_PUBLIC_APP_URL`

## Security notes

- Public pages must not query private tenant or financial data.
- Robots/sitemap exclusions are indexing guidance, not access control.
- Authenticated setup routes stay behind Clerk membership checks.
