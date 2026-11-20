import { Alert, AlertDescription, AlertTitle } from "@polivo/ui";

import { PublicPage, PublicSection } from "@/components/public-page";
import { buildPublicMetadata } from "@/lib/public/metadata";

export const metadata = buildPublicMetadata({
  title: "Privacy",
  description:
    "Privacy information for Polivo. Approved legal privacy policy text is pending product review.",
  pathname: "/privacy",
});

export default function PrivacyPage() {
  return (
    <PublicPage
      title="Privacy"
      description="High-level product privacy practices. This page is not a substitute for an approved legal privacy policy."
    >
      <Alert>
        <AlertTitle>Approved privacy policy pending</AlertTitle>
        <AlertDescription>
          No lawyer-approved privacy policy is stored in the repository yet. Public launch depends
          on product providing approved copy. Polivo does not claim compliance certifications here.
        </AlertDescription>
      </Alert>

      <PublicSection title="Accounts and authentication">
        <p>
          Online accounts are authenticated with Clerk. Stall membership and invitations control
          cloud access. Local staff credentials stay on the stall host and are separate from web
          accounts.
        </p>
      </PublicSection>

      <PublicSection title="Operational and financial data">
        <p>
          Each stall&apos;s authoritative operational database is local. Synchronized copies may be
          stored in the cloud for authorized reporting. Public marketing pages do not expose tenant
          or financial records.
        </p>
      </PublicSection>

      <PublicSection title="Support requests">
        <p>
          When contacting support, share only non-sensitive diagnostics. Do not send passwords,
          enrollment grants, private keys, or raw databases.
        </p>
      </PublicSection>
    </PublicPage>
  );
}
