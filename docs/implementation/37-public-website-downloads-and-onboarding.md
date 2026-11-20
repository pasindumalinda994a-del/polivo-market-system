# 37-public-website-downloads-and-onboarding.md

## Objective

Build the Polivo Market System public website, desktop download page, and guided onboarding experience.

Connect the public website to the authentication, stall creation, invitations, host enrollment, and local owner setup implemented in earlier phases.

Users must understand:

- What Polivo does.
- How the web dashboard and desktop application work together.
- What the stall host and additional terminals do.
- How to create or join a stall.
- How to download an available release.
- Which setup steps are complete and which still require action.

Implement this phase in the existing repository. Follow its approved architecture, domain rules, security boundaries, and design system.

Do not treat an unavailable installer or an incomplete enrollment as successful onboarding.

---

## 1. Review the existing implementation

Before editing, read:

- Repository instructions and Cursor rules.
- Project overview and architecture documents.
- Code standards and UI context.
- Progress tracker and architectural decisions.
- Existing public and authenticated web layouts.
- Shared UI components and validation contracts.
- Clerk authentication and invitation handling.
- Tenant onboarding and role management.
- Stall provisioning and device enrollment.
- Local owner setup and offline authentication.
- Desktop service connection and LAN terminal setup.
- Platform and stall administration.
- Existing release, download, or deployment configuration.

Inspect the implementations from Phases 12–16 and 33–36.

Identify:

1. Existing routes and route protection rules.
2. The authoritative tenant, stall, membership, and enrollment models.
3. Whether tenant creation and stall creation are separate operations.
4. How the first local owner setup grant is issued and redeemed.
5. How device enrollment completion is recorded.
6. How host and terminal connection readiness is established.
7. Which installer artifacts, if any, actually exist.
8. Existing approved product descriptions and support contacts.
9. Any unresolved onboarding or offline-access policy decisions.

Reuse existing services and contracts. Do not create a second onboarding backend or alternative enrollment mechanism.

Mark this phase `IN_PROGRESS`.

Record unresolved dependencies without changing earlier security rules to bypass them.

---

## 2. Preserve the system boundaries

Apply these rules throughout this phase:

- Clerk authenticates web users.
- Web membership determines authorized cloud access.
- Local staff authentication controls desktop business operations.
- A web account does not automatically create a local staff account.
- An invitation to a stall does not automatically provision desktop credentials.
- The stall service owns the local SQLite database.
- Desktop terminals communicate with the authorized stall service.
- The cloud financial dashboard uses synchronized data.
- Public pages must not expose tenant records or financial data.
- Host enrollment must use the existing authorized enrollment flow.
- Each stall follows the established single-authoritative-host rule.
- Sync is not a backup.

Do not introduce:

- Anonymous stall administration.
- Public administrative bootstrap endpoints.
- Browser access to SQLite.
- Public access to service-role credentials.
- Arbitrary enrollment through a supplied stall ID.
- Automatic host replacement.
- New billing, subscriptions, or payment collection.
- New public farmer or trader registration unless an approved workflow already exists.

Farmer and buyer business records remain distinct from web accounts and local staff accounts.

---

## 3. Define the public route structure

Use the repository's existing routing conventions.

Provide public destinations for:

- Home.
- Features.
- How it works.
- Downloads.
- Setup guide.
- Support.
- Approved privacy and terms information.

Reuse existing routes for:

- Sign in.
- Sign up.
- Invitation acceptance.
- Authenticated onboarding.
- Stall selection.
- Web dashboard.
- Stall administration.

Combine small informational pages where that improves navigation.

Do not introduce a CMS dependency solely for this phase.

Keep public navigation separate from authenticated application navigation while sharing the approved brand components.

Make the primary calls to action clear:

- Get started.
- Sign in.
- Download desktop application.
- Continue setup.

Preserve safe internal return paths through authentication. Reject external or malformed redirect destinations.

---

## 4. Build the public website

Create a responsive website using the existing design system.

Explain the actual product capabilities:

- Farmer and buyer management.
- Vegetable, package, and weight entry.
- Keyboard-first billing.
- Configurable commission using the approved rules.
- Farmer bills and buyer billing.
- Payments and outstanding balances.
- Statements, printing, and reports.
- Local stall operations.
- Cloud synchronization and authorized web reporting.
- Staff permissions and multiple terminals.

Explain the operating model in plain language:

1. The stall host runs the local service and database.
2. Desktop terminals connect to that host.
3. Local operations follow the configured access policy.
4. An internet connection allows synchronization and web access.
5. The web dashboard shows data received by the cloud.

Avoid unsupported claims, including:

- Unlimited offline access.
- Instant offline revocation.
- Guaranteed real-time cloud balances.
- Automatic disaster recovery.
- Available production installers before release verification.
- Unsupported inventory or profit calculations.
- Unimplemented cheque clearance workflows.

Do not fabricate testimonials, customer counts, certifications, pricing, or support commitments.

Keep unfinished public features out of promotional copy.

---

## 5. Implement public-page quality and accessibility

Provide:

- Mobile and desktop layouts.
- Semantic headings and landmarks.
- Keyboard-accessible navigation.
- Visible focus states.
- Accessible form labels and errors.
- Sufficient contrast.
- Reduced-motion support where animation exists.
- Appropriate image sizes and descriptive alternative text.
- Clear loading, unavailable, and error states.

Use approved brand assets and existing font handling.

If localized content is already supported, preserve that architecture. Do not advertise a language as fully supported when important pages remain untranslated.

Add:

- Page titles and descriptions.
- Canonical URLs derived from validated deployment configuration.
- Public sitemap entries.
- Appropriate social preview metadata.
- A useful not-found page.

Exclude authenticated routes, invitation acceptance URLs, and setup-token URLs from indexing and sitemap generation.

Treat robots directives as indexing guidance, not access control.

---

## 6. Define a trusted release catalog

Create or extend a typed release catalog using existing contracts and validation.

Capture the fields needed by the actual release process, such as:

- Release identifier.
- Product version.
- Channel.
- Publication state.
- Publication date.
- Supported operating system and architecture.
- Artifact filename.
- Artifact size.
- SHA-256 checksum.
- Trusted download location.
- Release notes.
- Minimum compatible service or protocol version where applicable.
- Signing verification status.
- Withdrawal state.

Distinguish:

- Planned release.
- Available test release.
- Available production release.
- Withdrawn release.

A planned release must not produce an active download button.

Do not label a release as signed or production-ready merely because a metadata field says so. Publication must depend on the release verification process established for the artifact.

Use a server-controlled source consistent with the repository. A reviewed, version-controlled catalog is acceptable until later release automation exists.

Do not build a public release-upload interface.

---

## 7. Build the download page

Display available releases with:

- Version and channel.
- Supported platform and architecture.
- Download size.
- Publication date.
- Release notes.
- Checksum.
- Accurate signing status.
- Installation prerequisites.
- Compatibility information.
- Setup guide link.

Present stable production releases as the default only when they exist and have passed the required publication checks.

Keep test releases clearly labeled and separate.

When no distributable exists, show:

“Desktop downloads are not available yet.”

Provide a useful setup overview without a fake download link or placeholder executable.

Validate artifact destinations against approved HTTPS origins and paths. Do not accept a download URL from a query parameter or other untrusted client input.

If using a redirect endpoint:

1. Accept a known release identifier.
2. Resolve the destination from the trusted catalog.
3. Reject unknown, unavailable, or withdrawn releases.
4. Return an appropriate error without exposing internal storage details.

If private storage is required, issue scoped, short-lived download links through the approved server path.

Never expose storage administration credentials.

A checksum helps verify artifact integrity; do not describe it as proof of publisher identity.

---

## 8. Keep installer and update work in the correct phases

This phase provides the website and release presentation.

Windows installer packaging and service lifecycle work belong to Phase 44.

Signed updates and compatibility enforcement belong to Phase 45.

Deployment automation belongs to Phase 46.

Prepare integration points for those phases without pretending their deliverables exist.

Do not:

- Generate an unsigned binary and label it a production release.
- Instruct users to disable operating-system protections.
- Install arbitrary code from website query parameters.
- Implement an alternative auto-updater.
- Claim browser downloads prove installation succeeded.

Document exactly which later release outputs the download catalog will consume.

---

## 9. Build the authenticated onboarding entry point

After authentication, resolve the user's state using trusted server-side records.

Support these entry paths:

- New user creating a permitted tenant or stall.
- Invited user joining an existing stall.
- Existing member selecting a stall.
- Existing owner continuing incomplete setup.
- Existing user opening an already configured workspace.

Follow the approved tenant and stall model. Do not assume every new user must create both.

Check current authorization on every sensitive step.

Do not infer membership or ownership from:

- Email similarity.
- Display name.
- Browser storage.
- A selected stall ID.
- Client-editable identity metadata.

Users with multiple memberships must receive an authorized stall selector.

Users without creation permission must not gain it by navigating directly to the creation route.

---

## 10. Make onboarding resumable and idempotent

Build onboarding progress from authoritative records.

Possible milestones include:

1. Web account authenticated.
2. Tenant or stall created, selected, or joined.
3. Required stall profile completed.
4. Host enrollment authorized.
5. Host enrollment completed.
6. First local owner setup completed.
7. Host connection verified.
8. Initial configuration applied.
9. Optional terminal setup completed.

Adapt these milestones to existing contracts.

Distinguish:

- Confirmed complete.
- Action required.
- Awaiting host confirmation.
- Blocked.
- Unknown because no trusted confirmation exists.

A user clicking “I downloaded it” may update a convenience checklist, but must not establish installation, enrollment, or service readiness.

Persist only necessary progress metadata. Prefer deriving business milestones from their underlying records.

Ensure:

- Refreshing resumes safely.
- Repeated submissions do not duplicate stalls or memberships.
- Multiple tabs cannot create conflicting setup records.
- Expired sessions require authentication before continuing.
- Stale pages cannot bypass changed permissions.
- Partial failures explain what was saved and what still needs retrying.

Use the existing idempotency and concurrency conventions.

---

## 11. Reuse stall creation and invitation acceptance

Connect onboarding to the existing Phase 13 services.

For stall creation:

- Validate the approved required fields.
- Enforce creation permission and applicable limits.
- Use the existing ownership assignment transaction.
- Prevent duplicate creation on retry.
- Keep business identifiers separate from display names.

For invitations:

- Use existing invitation validation and expiry.
- Verify the authenticated account satisfies the invitation policy.
- Recheck current invitation, stall, and grant authority.
- Prevent role escalation.
- Handle already accepted, revoked, expired, and wrong-account cases.
- Provide a safe way to sign in with the correct account.

Do not accept an invitation merely because the browser supplies a matching email address.

Invitation acceptance grants only the access represented by that invitation.

Keep local staff provisioning as a separate authorized process.

---

## 12. Guide host enrollment securely

Create a setup path for the stall's authoritative host.

Explain:

- This computer hosts the local service and database.
- Other terminals depend on its availability.
- Turning it off affects connected terminals.
- Its local data requires the later backup workflow.

Reuse Phase 14 authorization and enrollment.

Show enrollment details only to authorized users.

Preserve the existing handling of:

- Enrollment grants.
- Expiry.
- Single-use redemption.
- Device identity.
- Host authorization.
- Revocation.
- Existing-host conflicts.

Never put sensitive grants or device credentials into analytics, logs, public page content, or persistent browser storage.

Use the established secure handoff mechanism. Do not invent a URL-based secret handoff.

Handle:

- Grant expired before use.
- Grant already redeemed.
- Host already enrolled.
- Enrollment revoked.
- Network interruption.
- Stall suspended or otherwise restricted.
- Unsupported application version.

If the stall already has an authoritative host, direct additional computers to terminal setup.

Host replacement belongs to Phase 39.

---

## 13. Guide first-owner setup and terminal connection

Explain the distinction between web sign-in and desktop staff sign-in.

Use the existing first-owner setup grant flow:

1. An authorized owner completes the web-side prerequisites.
2. The approved setup mechanism makes the grant available.
3. The enrolled host validates and redeems it.
4. The local owner account is created through the established service.
5. The owner signs in locally and provisions permitted staff.

Do not create reusable default passwords.

Do not show local password hashes, PINs, or staff secrets in the web interface.

Do not mark owner setup complete unless supported by existing trusted evidence.

For additional terminals:

- Reuse Phase 16 connection and trust verification.
- Explain how to select or enter the approved host address.
- Validate the intended host and stall.
- Require local staff authentication.
- Show actionable host-unreachable and trust-mismatch errors.
- Explain that terminal installation does not create another stall host.

Do not recommend disabling TLS verification or opening broad firewall access.

Provide browser-based instructions without attempting to probe private LAN addresses from the public website.

---

## 14. Show readiness without overstating it

Provide a setup overview with separate status for:

- Web access.
- Stall profile.
- Host enrollment.
- Local owner setup.
- Local service readiness.
- Configuration delivery.
- Cloud synchronization.
- Additional terminals.

Show when information was last confirmed and where that confirmation came from.

A host enrolled yesterday is not necessarily online now.

Cloud receipt of a setup event does not prove every terminal is connected.

Successful synchronization does not prove backups exist.

When trusted readiness telemetry is unavailable, explain how the user can verify the step locally. Do not invent positive status.

Keep production offline access fail-closed where earlier policy decisions remain unresolved.

Offer the next permitted action based on current state rather than a universal “Finish setup” button.

---

## 15. Provide support and approved policy content

Create a support page using verified project contact information.

Include guidance for common setup issues:

- Sign-in or invitation problems.
- No available desktop release.
- Host enrollment failure.
- Existing-host conflict.
- Local owner setup incomplete.
- Host connection failure.
- Configuration awaiting delivery.
- Web reports awaiting synchronization.

Link to existing diagnostics where authorization permits.

Explain what users may safely include in a support request:

- Application version.
- Operating system.
- Non-sensitive error code.
- Time of failure.
- Redacted diagnostics reference.

Do not request passwords, enrollment grants, private keys, raw databases, or unrestricted financial exports.

Use approved privacy and terms content. Do not invent legal assurances or claim compliance certification.

If required content or contact information is missing, document the public-launch dependency. Do not publish fabricated values.

Avoid adding analytics or a contact-form provider unless already approved.

If an existing support form is reused, preserve its validation, abuse protection, privacy controls, and delivery-failure handling.

---

## 16. Secure public and onboarding surfaces

Use the established web security controls.

Verify:

- Public routes cannot query private tenant data.
- Authenticated onboarding responses are not publicly cached.
- Tenant and user changes clear sensitive client state.
- Server actions and APIs enforce current authorization.
- Mutations retain existing CSRF and origin protections.
- Rate limits cover appropriate public and invitation-sensitive endpoints.
- Errors do not enumerate private stalls or memberships.
- Return URLs cannot create open redirects.
- Release notes cannot inject executable content.
- Sensitive invitation and enrollment data is redacted from telemetry.
- Security headers remain compatible with the existing Clerk integration.

Keep any public content queries separate from privileged administrative queries.

Do not add public financial reporting or market-price publication in this phase unless an approved publication model already exists.

If publication exists, use its explicit approved dataset and privacy rules.

---

## 17. Add focused automated tests

Use the existing test tooling.

Cover public routes:

- Public pages render without authentication.
- Navigation and primary actions work.
- Authenticated pages remain protected.
- Private data is absent from public responses and page payloads.
- Metadata and sitemap exclude sensitive routes.

Cover releases:

- No-release state.
- Available test release.
- Verified production release.
- Withdrawn release.
- Unknown release identifier.
- Invalid artifact destination.
- Accurate checksum and signing presentation.
- No arbitrary redirect.

Cover onboarding:

- New authorized user.
- Existing member.
- Multiple-stall membership.
- Valid invitation.
- Expired, revoked, and wrong-account invitation.
- Permission revoked between rendering and submission.
- Duplicate and concurrent submissions.
- Interrupted setup and safe resume.
- Expired or previously redeemed enrollment grant.
- Existing authoritative host.
- Local owner setup awaiting confirmation.
- Unknown or stale host readiness.
- Restricted stall lifecycle state.

Verify tenant isolation and direct endpoint access, not only hidden UI controls.

Use explicit test fixtures. Do not weaken production enrollment or offline-access checks to make tests pass.

---

## 18. Verify the complete user journey

Run the repository's relevant:

- Formatting checks.
- Linting.
- Type checks.
- Unit and integration tests.
- Browser tests.
- Production web build.

Perform a development or staging smoke test using synthetic data:

1. Open the public home page while signed out.
2. Navigate through features and setup information.
3. Check the download page's actual availability state.
4. Sign up or sign in.
5. Create or select an authorized stall.
6. Refresh and confirm onboarding resumes.
7. Accept a separate test invitation.
8. Verify wrong-account and revoked invitation handling.
9. Authorize host enrollment using the existing flow.
10. Complete enrollment on a supported test host when available.
11. Complete local owner setup through the established grant.
12. Verify terminal guidance points to the enrolled host.
13. Confirm cloud status reflects only received evidence.
14. Verify an unauthorized user cannot access setup details.
15. Confirm public pages expose no tenant or financial information.

When no installer or supported host is available, complete the applicable web checks and record the remaining acceptance steps as pending.

Do not mark physical installation, secure host credential handling, or end-to-end enrollment verified solely from mocked browser tests.

---

## 19. Update documentation and handoff

Update the project progress tracker and relevant context documents.

Document:

- Public route map.
- Onboarding state model and authoritative evidence.
- Release catalog location and validation.
- Download publication and withdrawal procedure.
- Host and terminal setup guidance.
- Support content ownership.
- Outstanding public-launch dependencies.
- Pending real-host acceptance checks.
- Integration points for Phases 44–46.

Add or update:

- `docs/operations/public-website-and-downloads.md`
- `docs/operations/stall-onboarding.md`

Adapt these paths to repository conventions if equivalent documents already exist.

Keep manual account configuration, artifact publication, domain configuration, and legal-content approval clearly identified as operator work. Do not claim these external tasks were performed by repository changes.

---

## Acceptance criteria

This phase is complete when:

- The public website accurately describes implemented capabilities.
- Public and authenticated navigation work correctly.
- Download availability reflects real, validated artifacts.
- Missing releases have a clear unavailable state.
- Sign-in, stall selection, creation, and invitations reuse existing services.
- Onboarding resumes safely without duplicate business records.
- Host enrollment and local owner setup preserve their security boundaries.
- Additional terminals are guided to the existing stall host.
- Readiness indicators distinguish confirmed, pending, stale, and unknown states.
- Public pages expose no private tenant data.
- Relevant tests and production build pass.
- External dependencies and live acceptance gaps are documented.

Do not mark the complete system production-ready based on this phase alone.

## Required completion response

After implementation, report:

1. What was implemented.
2. Main files and routes changed.
3. Release availability and download behavior.
4. Onboarding flows connected to existing services.
5. Tests and build results.
6. Manual setup or verification still required.
7. Remaining blockers and security-sensitive pending checks.
8. Readiness for `38-local-and-cloud-backup-workflows.md`.