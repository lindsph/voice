export function authorize(request: Request): boolean {
  const secret = process.env.VOICE_API_SECRET?.trim();
  const production = process.env.NODE_ENV === "production";
  if (!secret) return !production;
  const header =
    request.headers.get("x-voice-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (header === secret) return true;
  if (production) return false;
  const host = request.headers.get("host") ?? "";
  return host.startsWith("127.0.0.1") || host.startsWith("localhost");
}
