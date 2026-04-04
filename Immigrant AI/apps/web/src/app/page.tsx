import { Benefits } from "@/components/home/benefits";
import { CallToAction } from "@/components/home/call-to-action";
import { Hero } from "@/components/home/hero";
import { PathwayTeaser } from "@/components/home/pathway-teaser";
import { ScoreTeaser } from "@/components/home/score-teaser";
import { AppShell } from "@/components/layout/app-shell";
import { getPublicEnv } from "@/lib/config";

export default function HomePage() {
  const config = getPublicEnv();

  return (
    <AppShell>
      <Hero config={config} />
      <Benefits />
      <ScoreTeaser />
      <PathwayTeaser />
      <CallToAction />
    </AppShell>
  );
}
