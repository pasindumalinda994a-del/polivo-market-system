import { SignIn } from "@clerk/nextjs";

import { AuthLayout } from "@/components/auth-layout";
import { polivoClerkAppearance } from "@/lib/auth/clerk-appearance";
import { DEFAULT_POST_AUTH_PATH, resolveSafeRedirectPath } from "@/lib/auth/redirects";

type SignInPageProps = {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const raw = Array.isArray(params.redirect_url) ? params.redirect_url[0] : params.redirect_url;
  const redirectUrl = resolveSafeRedirectPath(raw);

  return (
    <AuthLayout
      title="Sign in"
      description="Use your Polivo online account to access the web dashboard."
    >
      <SignIn
        appearance={polivoClerkAppearance}
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        forceRedirectUrl={redirectUrl}
        fallbackRedirectUrl={DEFAULT_POST_AUTH_PATH}
      />
    </AuthLayout>
  );
}
