import Link from "next/link";

import { PublicPage, PublicSection } from "@/components/public-page";
import { buildPublicMetadata } from "@/lib/public/metadata";

export const metadata = buildPublicMetadata({
  title: "How it works",
  description:
    "How the Polivo stall host, desktop terminals, local staff sign-in, and cloud web dashboard work together.",
  pathname: "/how-it-works",
});

export default function HowItWorksPage() {
  return (
    <PublicPage
      title="How it works"
      description="Polivo separates local stall operations from cloud account administration and reporting."
    >
      <PublicSection title="1. The stall host holds the database">
        <p>
          One computer is the authoritative host. It runs the local stall service and SQLite
          database. Turning the host off affects connected terminals. Local data requires a backup
          workflow separate from cloud sync.
        </p>
      </PublicSection>

      <PublicSection title="2. Desktop terminals connect to that host">
        <p>
          Additional computers install the desktop application and connect to the host over the
          local network. Terminal installation does not create another stall host. Trust pins and
          local staff sign-in are verified in the desktop app — this website does not probe private
          LAN addresses.
        </p>
      </PublicSection>

      <PublicSection title="3. Local operations follow stall policy">
        <p>
          Local staff authenticate on the desktop. Web membership is not a local staff account. An
          invitation to the web stall does not automatically create desktop credentials.
        </p>
      </PublicSection>

      <PublicSection title="4. Internet enables sync and web access">
        <p>
          When the host can reach the cloud, committed transactions synchronize for authorized
          reporting. The web dashboard shows data the cloud has received. It does not guarantee
          real-time balances or disaster recovery.
        </p>
      </PublicSection>

      <PublicSection title="5. Setup order">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Create or join a stall with your online account.</li>
          <li>Complete the stall profile if required.</li>
          <li>Authorize and enroll the host on the designated computer.</li>
          <li>Complete first local owner setup on that host.</li>
          <li>Connect additional terminals to the enrolled host.</li>
        </ol>
        <p>
          Continue with the{" "}
          <Link
            href="/setup"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            setup guide
          </Link>{" "}
          or{" "}
          <Link
            href="/downloads"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            downloads
          </Link>
          .
        </p>
      </PublicSection>
    </PublicPage>
  );
}
