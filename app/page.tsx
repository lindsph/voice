import Link from "next/link";

import { listProfiles } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const profiles = await listProfiles();

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/">
          Voice
        </Link>
      </header>
    <main>
      <p className="lede">
        One teacher. Separate mouths. Work on voice here; lindsay-assistant and
        WoolGrown call it when they draft.
      </p>
      <ul className="profile-list">
        {profiles.map((profile) => (
          <li key={profile.id} className="card">
            <h2>
              <Link href={`/${profile.id}`}>{profile.name}</Link>
            </h2>
            <p className="meta">{profile.description}</p>
          </li>
        ))}
      </ul>
    </main>
    </div>
  );
}
