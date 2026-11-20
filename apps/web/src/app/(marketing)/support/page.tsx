import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@polivo/ui";

import { PublicPage, PublicSection } from "@/components/public-page";
import { buildPublicMetadata } from "@/lib/public/metadata";

export const metadata = buildPublicMetadata({
  title: "Support",
  description:
    "Guidance for sign-in, invitations, downloads, host enrollment, and local setup. Verified Polivo support contacts are documented when approved.",
  pathname: "/support",
});

export default function SupportPage() {
  return (
    <PublicPage
      title="Support"
      description="Common setup issues and what is safe to include in a support request."
    >
      <Alert>
        <AlertTitle>Support contact pending approval</AlertTitle>
        <AlertDescription>
          No verified Polivo support email or phone is recorded in the project yet. Do not treat
          placeholder addresses as official. Operators should supply approved contact details before
          public launch.
        </AlertDescription>
      </Alert>

      <PublicSection title="Sign-in or invitation problems">
        <ul className="list-disc space-y-2 pl-5">
          <li>Use the same email account that was invited.</li>
          <li>Expired, revoked, or already-accepted invitations cannot be forced through.</li>
          <li>
            Sign in at{" "}
            <Link
              href="/sign-in"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              /sign-in
            </Link>{" "}
            with the correct account, then reopen the invitation link.
          </li>
        </ul>
      </PublicSection>

      <PublicSection title="No available desktop release">
        <p>
          If the downloads page shows that desktop downloads are not available yet, packaging has
          not published a verified artifact. Online stall creation can still proceed; host
          enrollment waits for a supported installer or development build process.
        </p>
      </PublicSection>

      <PublicSection title="Host enrollment failure">
        <ul className="list-disc space-y-2 pl-5">
          <li>Confirm the grant has not expired and has not already been redeemed.</li>
          <li>If an authoritative host already exists, use terminal setup instead.</li>
          <li>Do not share enrollment secrets in chat logs or screenshots.</li>
        </ul>
      </PublicSection>

      <PublicSection title="Local owner setup incomplete">
        <p>
          Owner setup completes only after the host redeems the setup grant and creates the local
          owner account. Web membership alone is not sufficient evidence.
        </p>
      </PublicSection>

      <PublicSection title="Host connection or configuration delivery">
        <p>
          Terminals must reach the enrolled host on the LAN and verify trust in the desktop app.
          Configuration delivery status appears for authorized owners after cloud publish and host
          acknowledgement. Unknown status means no trusted confirmation exists yet.
        </p>
      </PublicSection>

      <PublicSection title="Web reports awaiting synchronization">
        <p>
          Cloud reports show synchronized data with freshness indicators. Absence of recent sync
          does not mean local billing failed.
        </p>
      </PublicSection>

      <PublicSection title="What to include in a support request">
        <ul className="list-disc space-y-2 pl-5">
          <li>Application version</li>
          <li>Operating system</li>
          <li>Non-sensitive error code</li>
          <li>Time of failure</li>
          <li>Redacted diagnostics reference when available</li>
        </ul>
        <p className="pt-2">
          Do not send passwords, enrollment grants, private keys, raw databases, or unrestricted
          financial exports.
        </p>
      </PublicSection>
    </PublicPage>
  );
}
