import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { buildAlternates } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Privacy Policy — Immigrant Guru",
  description:
    "How Immigrant Guru collects, uses, and protects your personal data when you use our immigration-planning service.",
  alternates: buildAlternates("/privacy"),
  robots: { index: true, follow: true }
};

const LAST_UPDATED = "April 26, 2026";

export default function PrivacyPage() {
  return (
    <AppShell>
      <article className="mx-auto max-w-content px-6 py-16 md:px-10 md:py-24">
        <header className="mb-10">
          <p className="text-sm font-medium text-accent">Legal</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-muted">Last updated {LAST_UPDATED}</p>
        </header>

        <div className="prose prose-neutral max-w-none text-ink/85 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_p]:leading-relaxed [&_li]:leading-relaxed">
          <p>
            Immigrant Guru (&quot;we&quot;, &quot;us&quot;) operates the Immigrant Guru web app
            and mobile apps (the &quot;Service&quot;). This Privacy Policy explains what
            personal data the Service collects, why we collect it, and the
            choices you have about it.
          </p>

          <h2>1. Information we collect</h2>
          <ul>
            <li>
              <strong>Account data:</strong> the email address you sign in with,
              and your name if you choose to provide it (or if your Google /
              Apple sign-in shares it).
            </li>
            <li>
              <strong>Profile data you submit:</strong> immigration goals, country
              of origin and target country, education, work experience, language
              skills, and similar details you enter while building your plan.
            </li>
            <li>
              <strong>Usage data:</strong> app screens you visit, features you
              use, and crash diagnostics — used only to improve the Service.
            </li>
            <li>
              <strong>Billing data:</strong> we do <em>not</em> store your full
              card number. Payments are processed by Stripe (web) and Apple /
              Google billing (mobile); we receive a transaction reference and
              your subscription tier.
            </li>
            <li>
              <strong>Device tokens:</strong> if you opt in to push
              notifications, we store the token issued by your device&apos;s OS
              so we can deliver alerts.
            </li>
          </ul>

          <h2>2. How we use the information</h2>
          <ul>
            <li>To generate your personalized immigration analysis and visa recommendations.</li>
            <li>To operate your account, process billing, and send service-related emails.</li>
            <li>To respond to support requests.</li>
            <li>To diagnose problems and improve reliability and accuracy.</li>
            <li>To comply with legal obligations.</li>
          </ul>
          <p>
            We do <strong>not</strong> sell your personal data. We do not run
            third-party advertising or behavioural tracking.
          </p>

          <h2>3. AI processing</h2>
          <p>
            To produce your strategy, we send the relevant parts of your profile
            to an AI provider (currently OpenAI) under a contract that prohibits
            them from using your data to train their models. We do not include
            your name or email in those requests.
          </p>

          <h2>4. Data sharing</h2>
          <p>We share data only with the service providers required to run the Service:</p>
          <ul>
            <li>Cloud hosting: DigitalOcean (US/EU regions).</li>
            <li>Email delivery: Resend.</li>
            <li>Payments: Stripe, Apple, Google.</li>
            <li>AI inference: OpenAI.</li>
            <li>Subscription management: RevenueCat.</li>
          </ul>
          <p>
            Each provider is contractually bound to confidentiality and uses your
            data only to perform the service we asked of them.
          </p>

          <h2>5. Retention</h2>
          <p>
            We keep your account data for as long as your account is active.
            When you delete your account, we delete your profile and analyses
            within 30 days, except where we are required by law to retain
            specific records (for example tax records for billing transactions).
          </p>

          <h2>6. Your rights</h2>
          <p>
            You can access, export, correct, or delete your data at any time
            from the in-app settings, or by emailing{" "}
            <a className="text-accent hover:underline" href="mailto:privacy@immigrant.guru">
              privacy@immigrant.guru
            </a>
            . Residents of the EU/UK have additional rights under the GDPR; California
            residents have rights under the CCPA. Email us to exercise them.
          </p>

          <h2>7. Children</h2>
          <p>
            The Service is not intended for children under 16. We do not
            knowingly collect personal data from children. If you believe a
            child has signed up, contact us and we will remove the account.
          </p>

          <h2>8. Security</h2>
          <p>
            Data is transmitted over HTTPS (TLS) and stored encrypted at rest.
            Passwords are hashed with Argon2. Access to production systems is
            limited and audited.
          </p>

          <h2>9. International transfers</h2>
          <p>
            Our infrastructure is hosted primarily in the United States. If you
            access the Service from outside the US, your data will be
            transferred to and processed there.
          </p>

          <h2>10. Changes</h2>
          <p>
            If we change this policy materially, we will notify you in the app
            and by email at least 14 days before the change takes effect.
          </p>

          <h2>11. Contact</h2>
          <p>
            Questions: <a className="text-accent hover:underline" href="mailto:privacy@immigrant.guru">privacy@immigrant.guru</a>
            <br />
            Postal: Immigrant Guru, [Company address — to be filled before submission].
          </p>
        </div>
      </article>
    </AppShell>
  );
}
