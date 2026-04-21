import Link from "next/link";

// Kept dependency-free: when [locale]/layout calls notFound() (invalid
// locale param), providers haven't mounted yet so AppShell → SiteHeader
// → useAuthSession crashes. A plain page is safe in all render contexts.
export default function NotFound() {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f5f5f7", color: "#1d1d1f", minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <main style={{ textAlign: "center", padding: "2rem" }}>
          <p style={{ fontSize: "6rem", fontWeight: 700, margin: "0 0 0.5rem", lineHeight: 1, background: "linear-gradient(135deg, #4f46e5, #7c3aed)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>404</p>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.75rem" }}>Page not found</h1>
          <p style={{ fontSize: "0.95rem", color: "#6e6e73", margin: "0 0 1.5rem" }}>
            The page you&apos;re looking for doesn&apos;t exist.
          </p>
          <Link
            href="/"
            style={{ display: "inline-block", padding: "0.65rem 1.5rem", borderRadius: "9999px", background: "#1d1d1f", color: "white", textDecoration: "none", fontWeight: 600, fontSize: "0.9rem" }}
          >
            Go home
          </Link>
        </main>
      </body>
    </html>
  );
}
