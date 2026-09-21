export type VoiceClient = {
  url: string;
  key?: string;
};

export type VoiceBundle = {
  bundle: string;
  profile: { id: string; name: string; guide?: string };
  golds?: { title: string; body: string; source: string }[];
  learnings?: { id: string; rule: string }[];
};

export type VoiceDraft = {
  body: string;
  retried: boolean;
};

export type VoiceLearnResult = {
  learningCount: number;
  keptGold: boolean;
};

function headers(client: VoiceClient): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (client.key) headers["x-voice-key"] = client.key;
  return headers;
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

export function voiceFromEnv(): VoiceClient | null {
  const url = process.env.VOICE_URL?.trim().replace(/\/$/, "");
  if (!url) return null;
  return { url, key: process.env.VOICE_API_SECRET?.trim() || undefined };
}

export async function fetchVoiceBundle(
  client: VoiceClient,
  input: { profileId: string; surface: string; seed?: string },
): Promise<VoiceBundle> {
  const query = new URLSearchParams({ surface: input.surface });
  if (input.seed) query.set("seed", input.seed);
  const response = await fetch(
    `${client.url}/api/profiles/${input.profileId}/bundle?${query}`,
    { headers: headers(client), cache: "no-store" },
  );
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as VoiceBundle;
}

export async function generateVoiceDraft(
  client: VoiceClient,
  input: { profileId: string; surface: string; facts: string; seed?: string },
): Promise<VoiceDraft> {
  const response = await fetch(`${client.url}/api/profiles/${input.profileId}/generate`, {
    method: "POST",
    headers: headers(client),
    body: JSON.stringify({
      surface: input.surface,
      facts: input.facts,
      seed: input.seed,
    }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as VoiceDraft;
}

export async function teachVoice(
  client: VoiceClient,
  input: {
    profileId: string;
    before?: string;
    after?: string;
    why?: string;
    rule?: string;
    keepAsGold?: boolean;
    title?: string;
    surface?: string;
    sourceDraftId?: string | null;
  },
): Promise<VoiceLearnResult> {
  const { profileId, ...body } = input;
  const response = await fetch(`${client.url}/api/profiles/${profileId}/learn`, {
    method: "POST",
    headers: headers(client),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as VoiceLearnResult;
}

export async function listVoiceLearnings(
  client: VoiceClient,
  profileId: string,
): Promise<{ id: string; rule: string }[]> {
  const response = await fetch(`${client.url}/api/profiles/${profileId}/learnings`, {
    headers: headers(client),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await readError(response));
  const payload = (await response.json()) as { learnings?: { id: string; rule: string }[] };
  return payload.learnings ?? [];
}

export async function dismissVoiceLearning(
  client: VoiceClient,
  id: string,
): Promise<void> {
  const response = await fetch(`${client.url}/api/learnings/${id}`, {
    method: "PATCH",
    headers: headers(client),
  });
  if (!response.ok) throw new Error(await readError(response));
}
