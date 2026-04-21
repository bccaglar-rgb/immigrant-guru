import Link from "next/link";

// Root-level 404 — rendered by Next for paths that don't resolve to any
// [locale] match. Kept dependency-free (no providers, no auth hooks) so the
// prerender pass for `/_not-found` doesn't pull useAuthSession into a tree
// that has no AuthProvider above it.
export default function RootNotFound() {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f5f5f7", color: "#1d1d1f", minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <main style={{ textAlign: "center", padding: "2rem" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, margin: "0 0 0.75rem" }}>Page not found</h1>
          <p style={{ fontSize: "1rem", color: "#6e6e73", margin: "0 0 1.5rem" }}>
            The page you are looking for doesn&apos;t exist.
          </p>
          <Link
            href="/"
            style={{ display: "inline-block", padding: "0.65rem 1.25rem", borderRadius: "9999px", background: "#1d1d1f", color: "white", textDecoration: "none", fontWeight: 600 }}
          >
            Go home
          </Link>
        </main>
      </body>
    </html>
  );
}
