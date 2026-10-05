import { notFound } from "next/navigation";

import { ProfileDesk } from "@/components/profile-desk";
import { RecentGenerations } from "@/components/recent-generations";
import { listGenerationLogs } from "@/lib/generation-log";
import { getProfile, listGolds, listLearnings } from "@/lib/store";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ profile: string }>;
};

export default async function ProfilePage({ params }: Props) {
  const { profile: id } = await params;
  try {
    const [profile, golds, learnings, logs] = await Promise.all([
      getProfile(id),
      listGolds(id),
      listLearnings(id),
      listGenerationLogs(id),
    ]);
    return (
      <main>
        <p className="lede">{profile.description}</p>
        <ProfileDesk profile={profile} golds={golds} learnings={learnings} />
        <RecentGenerations profile={profile} logs={logs} />
      </main>
    );
  } catch {
    notFound();
  }
}
