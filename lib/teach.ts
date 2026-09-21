/**
 * Per-integration teach switch. Apps decide whether *this host* may write
 * learnings to Voice. The Voice desk itself always teaches.
 *
 *   VOICE_TEACH=on|off   explicit lever
 *   defaultMode=always   lindsay-assistant (local included)
 *   defaultMode=production   WoolGrown (Fly only unless the lever is pulled)
 */

export type VoiceTeachMode = "always" | "production";

export function parseTeachFlag(raw: string | null | undefined): boolean | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "1" || value === "true" || value === "yes" || value === "on") {
    return true;
  }
  if (value === "0" || value === "false" || value === "no" || value === "off") {
    return false;
  }
  return null;
}

export function voiceIntegrationTeaches(input: {
  voiceTeach?: string | null;
  nodeEnv?: string | null;
  defaultMode: VoiceTeachMode;
}): boolean {
  const flag = parseTeachFlag(input.voiceTeach);
  if (flag !== null) return flag;
  if (input.defaultMode === "always") return true;
  return (input.nodeEnv ?? "development") === "production";
}
