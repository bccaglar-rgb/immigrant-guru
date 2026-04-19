type JsonLdValue = Record<string, unknown>;

function Script({ data }: { data: JsonLdValue }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function BreadcrumbLd({
  items
}: {
  items: { name: string; url: string }[];
}) {
  return (
    <Script
      data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: item.name,
          item: item.url
        }))
      }}
    />
  );
}

export function FaqLd({
  faqs
}: {
  faqs: { question: string; answer: string }[];
}) {
  return (
    <Script
      data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer }
        }))
      }}
    />
  );
}

export function ArticleLd({
  headline,
  description,
  url,
  datePublished,
  dateModified
}: {
  headline: string;
  description: string;
  url: string;
  datePublished?: string;
  dateModified?: string;
}) {
  return (
    <Script
      data={{
        "@context": "https://schema.org",
        "@type": "Article",
        headline,
        description,
        url,
        datePublished: datePublished ?? new Date().toISOString(),
        dateModified: dateModified ?? new Date().toISOString(),
        author: { "@type": "Organization", name: "Immigrant Guru" },
        publisher: {
          "@type": "Organization",
          name: "Immigrant Guru",
          url: "https://immigrant.guru"
        }
      }}
    />
  );
}

export function HowToLd({
  name,
  description,
  steps
}: {
  name: string;
  description: string;
  steps: { name: string; text: string }[];
}) {
  return (
    <Script
      data={{
        "@context": "https://schema.org",
        "@type": "HowTo",
        name,
        description,
        step: steps.map((step, index) => ({
          "@type": "HowToStep",
          position: index + 1,
          name: step.name,
          text: step.text
        }))
      }}
    />
  );
}
