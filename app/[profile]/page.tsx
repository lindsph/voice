import { notFound } from "next/navigation";

import { ProfileDesk } from "@/components/profile-desk";
import { ProfileHealth } from "@/components/profile-health";
import { ProfileScrollHeader } from "@/components/profile-scroll-header";
import { RecentGenerations } from "@/components/recent-generations";
import { countDraftsByGold, listGenerationLogs } from "@/lib/generation-log";
import { healthDays, loadHealthReport } from "@/lib/health";
import { getProfile, listGolds, listLearnings } from "@/lib/store";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ profile: string }>;
  searchParams: Promise<{ days?: string }>;
};

export default async function ProfilePage({ params, searchParams }: Props) {
  const { profile: id } = await params;
  const { days } = await searchParams;
  try {
    const [profile, golds, learnings, logs, health, draftCounts] = await Promise.all([
      getProfile(id),
      listGolds(id),
      listLearnings(id),
      listGenerationLogs(id),
      loadHealthReport(id, healthDays(days)),
      countDraftsByGold(id),
    ]);
    const surfaces = profile.surfaces.map((surface) => surface.label).join(" · ");
    return (
      <>
        <ProfileScrollHeader name={profile.name} description={profile.description} surfaces={surfaces} />
        <main className="w-full pt-20 bg-background min-h-screen">
          <div className="max-w-7xl mx-auto px-margin-mobile lg:px-margin-desktop py-space-xl">
            <div className="flex flex-col w-full">
              <div className="relative w-full">
                <div className="absolute -top-16 left-1/4 w-96 h-96 bg-primary-container/10 rounded-full blur-3xl pointer-events-none -z-10" />
                <div className="absolute top-[600px] -right-20 w-80 h-80 bg-primary/5 rounded-full blur-2xl pointer-events-none -z-10" />
                <header className="w-full pb-space-xl" id="project-hero">
                  <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-lg pb-space-lg">
                    <div>
                      <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight mb-space-xs">{profile.name}</h1>
                      <p className="font-headline-sm text-headline-sm text-on-surface-variant italic">{profile.description}</p>
                    </div>
                    <div className="flex items-center gap-space-md self-start lg:self-end">
                      <div className="px-space-md py-space-xs rounded-lg bg-surface-container-low flex items-center gap-space-md text-on-surface-variant font-code-md text-code-md">
                        <span className="flex items-center gap-1.5 text-on-surface">
                          <span className="material-symbols-outlined text-[15px] text-tertiary">layers</span>
                          Surfaces: {surfaces}
                        </span>
                      </div>
                    </div>
                  </div>
                </header>
                <section className="w-full mb-space-xl">
                  <div className="p-space-lg rounded-xl bg-surface-container-low shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-space-md">
                    <div className="flex items-center gap-space-md">
                      <div className="w-10 h-10 rounded-lg bg-primary-container/20 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-primary">eco</span>
                      </div>
                      <div>
                        <span className="font-label-sm text-label-sm text-primary uppercase tracking-widest block mb-0.5">
                          Core Directive
                        </span>
                        <p className="font-body-lg text-body-lg text-on-surface">{profile.description}</p>
                      </div>
                    </div>
                    <span className="font-code-md text-code-md text-outline shrink-0">Profile ID: {profile.id}</span>
                  </div>
                </section>
                <ProfileDesk profile={profile} golds={golds} learnings={learnings} draftCounts={draftCounts} />
                <ProfileHealth profile={profile} report={health} />
                <RecentGenerations profile={profile} logs={logs} />
              </div>
            </div>
          </div>
        </main>
        <footer className="w-full bg-surface-container-lowest">
          <div className="max-w-7xl mx-auto px-margin-mobile lg:px-margin-desktop py-space-xl flex flex-col sm:flex-row items-center justify-between gap-space-md">
            <div className="flex items-center gap-space-sm">
              <span className="font-headline-sm text-headline-sm text-on-surface-variant">Voice</span>
              <span className="font-label-sm text-label-sm text-outline tracking-wider uppercase">— Cadence & Prose</span>
            </div>
            <div className="font-code-md text-code-md text-outline">© 2025 Voice Editorial System. Preserving focus.</div>
          </div>
        </footer>
      </>
    );
  } catch {
    notFound();
  }
}
