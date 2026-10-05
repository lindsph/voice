import { HomeDesk } from "@/components/home-desk";
import { healthDays, loadHealthReport } from "@/lib/health";
import { listProfiles } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days } = await searchParams;
  const windowDays = healthDays(days);
  const profiles = await listProfiles();
  const reports = await Promise.all(profiles.map((profile) => loadHealthReport(profile.id, windowDays)));
  return <HomeDesk cards={profiles.map((profile, index) => ({ profile, report: reports[index]! }))} />;
}
