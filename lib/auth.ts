export function authorize(request: Request): boolean {
  const secret = process.env.VOICE_API_SECRET?.trim();
  if (!secret) return true;
  const header =
    request.headers.get("x-voice-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (header === secret) return true;
  const host = request.headers.get("host") ?? "";
  return host.startsWith("127.0.0.1") || host.startsWith("localhost");
}
