import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-[28px] font-semibold leading-9 text-foreground">Polivo</h1>
      <h2 className="text-xl font-semibold text-foreground">Web application foundation</h2>
      <p className="text-muted-foreground">The web application is running.</p>
      <p>
        <Link
          className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/dashboard"
        >
          Open dashboard shell
        </Link>
      </p>
    </main>
  );
}
