import { requirePageUser } from "@/lib/auth/require-user";

import { InvitationAccept } from "./invitation-accept";

export const dynamic = "force-dynamic";

type InvitationPageProps = {
  params: Promise<{ token: string }>;
};

export default async function InvitationPage({ params }: InvitationPageProps) {
  const { token: rawToken } = await params;
  const token = decodeURIComponent(rawToken);
  await requirePageUser(`/invitations/${encodeURIComponent(token)}`);
  return <InvitationAccept token={token} />;
}
