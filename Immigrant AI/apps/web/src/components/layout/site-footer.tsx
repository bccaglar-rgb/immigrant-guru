import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white/50">
      <div className="mx-auto flex max-w-content flex-col gap-4 px-6 py-6 text-sm text-muted md:flex-row md:items-center md:justify-between md:px-10">
        <p>Immigrant Guru helps you evaluate pathways, compare strategies, and act with clarity.</p>
        <div className="flex gap-5">
          <Link className="hover:text-ink transition-colors" href="/sign-in">
            Sign in
          </Link>
          <Link className="hover:text-ink transition-colors" href="/sign-up">
            Sign up
          </Link>
          <Link className="hover:text-ink transition-colors" href="/dashboard">
            Dashboard
          </Link>
        </div>
      </div>
    </footer>
  );
}
