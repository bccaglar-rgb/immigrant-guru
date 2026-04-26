import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { buildAlternates } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Terms of Service — Immigrant Guru",
  description:
    "The terms that govern your use of the Immigrant Guru immigration-planning service.",
  alternates: buildAlternates("/terms"),
  robots: { index: true, follow: true }
};

const LAST_UPDATED = "April 26, 2026";

export default function TermsPage() {
  return (
    <AppShell>
      <article className="mx-auto max-w-content px-6 py-16 md:px-10 md:py-24">
        <header className="mb-10">
          <p className="text-sm font-medium text-accent">Legal</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            Terms of Service
          </h1>
          <p className="mt-3 text-sm text-muted">Last updated {LAST_UPDATED}</p>
        </header>

        <div className="prose prose-neutral max-w-none text-ink/85 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_p]:leading-relaxed [&_li]:leading-relaxed">
          <p>
            These Terms of Service (&quot;Terms&quot;) govern your access to and use of the
            Immigrant Guru web app and mobile apps (the &quot;Service&quot;), operated by
            Immigrant Guru (&quot;we&quot;, &quot;us&quot;). By creating an account or using the
            Service you agree to these Terms.
          </p>

          <h2>1. The Service</h2>
          <p>
            Immigrant Guru is an AI-assisted information tool that helps you
            explore visa options, build a personalized immigration roadmap, and
            organize the documents and steps required for your move. The Service
            is informational. It is <strong>not legal advice</strong> and we are
            not a law firm or licensed immigration consultancy. Decisions you
            make in your immigration journey are your own responsibility, and
            you should consult a qualified attorney or accredited representative
            before taking action.
          </p>

          <h2>2. Eligibility</h2>
          <p>
            You must be at least 16 years old to use the Service. By creating
            an account you represent that you are.
          </p>

          <h2>3. Account</h2>
          <ul>
            <li>You are responsible for keeping your sign-in credentials confidential.</li>
            <li>You are responsible for activity that takes place under your account.</li>
            <li>Notify us promptly at <a className="text-accent hover:underline" href="mailto:support@immigrant.guru">support@immigrant.guru</a> if you suspect unauthorized access.</li>
          </ul>

          <h2>4. Subscriptions and payment</h2>
          <p>
            The Service is paid. Plans, prices, and billing terms are presented
            before purchase. On the web we use Stripe; on mobile we use the
            Apple App Store or Google Play billing systems. Subscriptions
            renew automatically unless cancelled before the renewal date. You
            can manage and cancel subscriptions in your account settings or
            (for mobile purchases) via your App Store / Play account.
          </p>
          <p>
            Where required by law we offer a 14-day cooling-off period for
            consumer purchases. For App Store and Google Play purchases, refund
            handling follows the platform&apos;s own policy.
          </p>

          <h2>5. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the Service for any unlawful purpose or to submit forged identity documents.</li>
            <li>Reverse-engineer, scrape, or automate access to the Service in ways that disrupt its operation.</li>
            <li>Resell, redistribute, or relabel the Service or its outputs as your own commercial product.</li>
            <li>Upload content that infringes third-party rights or that contains malware.</li>
          </ul>

          <h2>6. Your content</h2>
          <p>
            You retain ownership of the personal information and documents you
            upload. You grant us a limited, non-exclusive licence to process
            them solely to provide the Service to you (including transmitting
            relevant fields to our AI provider as described in our{" "}
            <a className="text-accent hover:underline" href="/privacy">
              Privacy Policy
            </a>
            ).
          </p>

          <h2>7. AI-generated content</h2>
          <p>
            Recommendations are produced by AI based on the data you provide.
            They may contain inaccuracies. Always verify visa requirements and
            timelines with official government sources or a qualified
            professional before acting on them.
          </p>

          <h2>8. Service availability</h2>
          <p>
            We aim for high availability but we do not guarantee uninterrupted
            service. We may temporarily suspend the Service for maintenance,
            security, or to respond to abuse.
          </p>

          <h2>9. Termination</h2>
          <p>
            You can delete your account at any time from settings. We may
            suspend or terminate your account if you breach these Terms or use
            the Service in a way that creates risk for us or others. On
            termination, paid features stop and your data is deleted as
            described in the Privacy Policy.
          </p>

          <h2>10. Disclaimers</h2>
          <p>
            THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot;, WITHOUT
            WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF
            MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
            NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE
            ERROR-FREE OR THAT ANY VISA APPLICATION WILL BE SUCCESSFUL.
          </p>

          <h2>11. Limitation of liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, IMMIGRANT GURU SHALL NOT BE
            LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES,
            OR FOR LOST PROFITS, REVENUES, DATA, OR OPPORTUNITIES, ARISING OUT
            OF OR RELATED TO THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM
            SHALL NOT EXCEED THE FEES YOU PAID US IN THE TWELVE MONTHS
            PRECEDING THE CLAIM.
          </p>

          <h2>12. Governing law</h2>
          <p>
            These Terms are governed by the laws of the jurisdiction in which
            Immigrant Guru is established (to be specified before launch).
            Mandatory consumer-protection laws of your country of residence
            still apply.
          </p>

          <h2>13. Changes to these Terms</h2>
          <p>
            We may update these Terms. We will notify you of material changes
            in the app or by email at least 14 days in advance. Continued use
            after the effective date means you accept the updated Terms.
          </p>

          <h2>14. Contact</h2>
          <p>
            <a className="text-accent hover:underline" href="mailto:support@immigrant.guru">
              support@immigrant.guru
            </a>
          </p>
        </div>
      </article>
    </AppShell>
  );
}
