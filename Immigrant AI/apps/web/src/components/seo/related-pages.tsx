import Link from "next/link";

export type RelatedLink = {
  href: string;
  title: string;
  description?: string;
};

export function RelatedPages({
  heading = "Related pages",
  links
}: {
  heading?: string;
  links: RelatedLink[];
}) {
  if (links.length === 0) return null;
  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-16">
      <h2 className="text-2xl font-semibold text-white">{heading}</h2>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="block rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-white/30 hover:bg-white/10"
            >
              <div className="text-base font-semibold text-white">{link.title}</div>
              {link.description ? (
                <p className="mt-1 text-sm text-white/70">{link.description}</p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
