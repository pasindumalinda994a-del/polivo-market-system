import Link from "next/link";

import { Button } from "@polivo/ui";

import { PublicPage, PublicSection } from "@/components/public-page";
import { buildPublicMetadata } from "@/lib/public/metadata";

export const metadata = buildPublicMetadata({
  title: "Setup guide",
  description:
    "Create or join a stall online, enroll the authoritative host, complete local owner setup, and connect terminals.",
  pathname: "/setup",
});

export default function SetupGuidePage() {
  return (
    <PublicPage
      title="Setup guide"
      description="Online account steps and desktop host/terminal steps are separate. Finish each milestone using trusted records — not a self-reported checklist alone."
    >
      <PublicSection title="Before you begin">
        <ul className="list-disc space-y-2 pl-5">
          <li>Decide which computer will be the stall host. Other terminals depend on it.</li>
          <li>
            Confirm a desktop release is available on the{" "}
            <Link
              href="/downloads"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              downloads
            </Link>{" "}
            page. If downloads are unavailable, you can still complete online stall creation and
            wait for packaging.
          </li>
          <li>Web sign-in is not a local staff login. Local passwords are created on the host.</li>
        </ul>
      </PublicSection>

      <PublicSection title="1. Create or join a stall">
        <p>
          Sign up or sign in, then create a stall (owners) or accept an invitation with the invited
          email account. Membership is checked server-side on every sensitive step.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Button asChild>
            <Link href="/sign-up">Get started</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/dashboard">Continue setup</Link>
          </Button>
        </div>
      </PublicSection>

      <PublicSection title="2. Complete the stall profile">
        <p>
          Owners can revise stall profile details from stall administration. Keep business
          identifiers separate from display names.
        </p>
      </PublicSection>

      <PublicSection title="3. Authorize and enroll the host">
        <p>
          From Devices, authorize host enrollment. Redeem the one-time grant on the host computer
          using the desktop/stall-service enrollment flow. Sensitive grants are shown once and must
          not be pasted into public pages or analytics.
        </p>
        <p>
          If a host is already enrolled, additional computers should use terminal setup — not a
          second host enrollment. Host replacement is a later recovery workflow.
        </p>
      </PublicSection>

      <PublicSection title="4. Complete first local owner setup">
        <p>
          An authorized owner issues a local owner setup grant from the web. The enrolled host
          redeems it and creates the local owner account through the stall service. Do not invent
          reusable default passwords.
        </p>
      </PublicSection>

      <PublicSection title="5. Connect additional terminals">
        <p>
          Install the desktop application on each terminal, enter the approved host address in the
          desktop app, verify trust, and sign in with local staff credentials. This website does not
          scan your LAN.
        </p>
      </PublicSection>

      <PublicSection title="Readiness">
        <p>
          After you belong to a stall, open Continue setup on the dashboard for a status overview
          that distinguishes confirmed, awaiting, blocked, and unknown states. Clicking “I
          downloaded it” never marks enrollment or service readiness complete.
        </p>
      </PublicSection>
    </PublicPage>
  );
}
