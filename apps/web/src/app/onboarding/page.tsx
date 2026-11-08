import { requirePageUser } from "@/lib/auth/require-user";

import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  await requirePageUser("/onboarding");
  return <OnboardingForm />;
}
