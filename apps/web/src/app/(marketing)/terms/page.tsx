import { Alert, AlertDescription, AlertTitle } from "@polivo/ui";

import { PublicPage, PublicSection } from "@/components/public-page";
import { buildPublicMetadata } from "@/lib/public/metadata";

export const metadata = buildPublicMetadata({
  title: "Terms",
  description: "Terms overview for Polivo. Approved legal terms of use are pending product review.",
  pathname: "/terms",
});

export default function TermsPage() {
  return (
    <PublicPage
      title="Terms"
      description="Informational terms overview. This page does not invent contractual or warranty language."
    >
      <Alert>
        <AlertTitle>Approved terms pending</AlertTitle>
        <AlertDescription>
          No approved terms of use are stored in the repository yet. Do not treat this page as a
          binding agreement or compliance certification.
        </AlertDescription>
      </Alert>

      <PublicSection title="Product scope">
        <p>
          Polivo provides stall operations software, desktop terminals, and authorized cloud
          reporting as described in the product documentation. Features that are not implemented are
          not promised by marketing copy.
        </p>
      </PublicSection>

      <PublicSection title="Accounts and stalls">
        <p>
          Access depends on authenticated accounts, memberships, invitations, and local staff
          credentials as applicable. Unauthorized access to another stall&apos;s data is not
          permitted.
        </p>
      </PublicSection>

      <PublicSection title="Downloads and updates">
        <p>
          Only verified catalog entries are offered for download. Planned releases do not produce
          download buttons. Users should not disable operating-system protections to install
          software.
        </p>
      </PublicSection>
    </PublicPage>
  );
}
