import { notFound } from "next/navigation";

import { ProfileDesk } from "@/components/profile-desk";
import { ProfileHealth } from "@/components/profile-health";
import { RecentGenerations } from "@/components/recent-generations";
import { listGenerationLogs } from "@/lib/generation-log";
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
    const [profile, golds, learnings, logs, health] = await Promise.all([
      getProfile(id),
      listGolds(id),
      listLearnings(id),
      listGenerationLogs(id),
      loadHealthReport(id, healthDays(days)),
    ]);
    return (
      <main>
        <p className="lede">{profile.description}</p>
        <ProfileDesk profile={profile} golds={golds} learnings={learnings} />
        <ProfileHealth profile={profile} report={health} />
        <RecentGenerations profile={profile} logs={logs} />
      </main>
    );
  } catch {
    notFound();
  }
}
