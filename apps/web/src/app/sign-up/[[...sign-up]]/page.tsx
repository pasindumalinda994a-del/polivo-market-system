import { SignUp } from "@clerk/nextjs";

import { AuthLayout } from "@/components/auth-layout";
import { polivoClerkAppearance } from "@/lib/auth/clerk-appearance";
import { DEFAULT_POST_AUTH_PATH, resolveSafeRedirectPath } from "@/lib/auth/redirects";

type SignUpPageProps = {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams;
  const raw = Array.isArray(params.redirect_url) ? params.redirect_url[0] : params.redirect_url;
  const redirectUrl = resolveSafeRedirectPath(raw);

  return (
    <AuthLayout
      title="Create account"
      description="Registration creates an online account only. Stall access requires an active membership."
    >
      <SignUp
        appearance={polivoClerkAppearance}
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl={redirectUrl}
        fallbackRedirectUrl={DEFAULT_POST_AUTH_PATH}
      />
    </AuthLayout>
  );
}
