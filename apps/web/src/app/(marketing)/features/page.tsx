import Link from "next/link";

import { PublicPage, PublicSection } from "@/components/public-page";
import { buildPublicMetadata } from "@/lib/public/metadata";

export const metadata = buildPublicMetadata({
  title: "Features",
  description:
    "Farmer and buyer management, keyboard-first billing, commissions, payments, local multi-terminal operations, and authorized cloud reporting.",
  pathname: "/features",
});

export default function FeaturesPage() {
  return (
    <PublicPage
      title="Features"
      description="Capabilities that are implemented in Polivo today. Unfinished work is not advertised here."
    >
      <PublicSection title="Farmers, buyers, and catalog">
        <p>
          Register farmers and buyers with stall-scoped short codes. Maintain vegetable records,
          package types, and individual package weight entry used during billing.
        </p>
      </PublicSection>

      <PublicSection title="Keyboard-first billing and commissions">
        <p>
          Desktop billing is designed for fast entry. Configurable commission rules are applied by
          the stall service using the stall&apos;s approved policy. Buyer bills and farmer bills are
          generated from the same underlying sale records.
        </p>
      </PublicSection>

      <PublicSection title="Payments and balances">
        <p>
          Record cash and bank payments, allocate them to bills, and track outstanding balances.
          Farmer cheque handover settlement is supported where configured; buyer cheques and
          cheque-clearance workflows that are not implemented are not claimed here.
        </p>
      </PublicSection>

      <PublicSection title="Statements, printing, and reports">
        <p>
          Local statements, print jobs with authorized reprints, and filtered reports/exports are
          available on the desktop. The web dashboard provides read-only financial reporting from
          synchronized cloud data, with visible freshness.
        </p>
      </PublicSection>

      <PublicSection title="Local stall operations and cloud sync">
        <p>
          One authoritative host runs the local service and database. Additional terminals connect
          over the LAN with trust verification. When the internet is available, committed records
          synchronize to the cloud. Successful sync does not delete local records and is not a
          substitute for backups.
        </p>
      </PublicSection>

      <PublicSection title="Staff permissions and devices">
        <p>
          Web memberships and invitations manage online access. Local staff accounts are separate
          and provisioned on the host. Owners manage permission profiles, devices, and enrollment
          through the stall administration screens.
        </p>
        <p>
          See the{" "}
          <Link
            href="/how-it-works"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            operating model
          </Link>{" "}
          and{" "}
          <Link
            href="/setup"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            setup guide
          </Link>{" "}
          for how these pieces fit together.
        </p>
      </PublicSection>
    </PublicPage>
  );
}
