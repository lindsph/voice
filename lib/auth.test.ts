import { afterEach, describe, expect, it } from "vitest";

import { authorize } from "./auth";

const env = process.env as Record<string, string | undefined>;
const prevNodeEnv = env.NODE_ENV;
const prevSecret = env.VOICE_API_SECRET;

afterEach(() => {
  env.NODE_ENV = prevNodeEnv;
  if (prevSecret === undefined) delete env.VOICE_API_SECRET;
  else env.VOICE_API_SECRET = prevSecret;
});

function request(headers: Record<string, string>): Request {
  return new Request("http://example.test/api/profiles", { headers });
}

describe("authorize", () => {
  it("requires the secret in production even when Host looks local", () => {
    env.NODE_ENV = "production";
    env.VOICE_API_SECRET = "test-secret";
    expect(authorize(request({ host: "localhost:3030" }))).toBe(false);
    expect(authorize(request({ host: "lindsay-voice.fly.dev" }))).toBe(false);
    expect(authorize(request({ "x-voice-key": "test-secret" }))).toBe(true);
    expect(
      authorize(request({ authorization: "Bearer test-secret" })),
    ).toBe(true);
  });

  it("denies production when the secret is missing", () => {
    env.NODE_ENV = "production";
    delete env.VOICE_API_SECRET;
    expect(authorize(request({ host: "localhost" }))).toBe(false);
  });

  it("allows localhost without a key when not in production", () => {
    env.NODE_ENV = "test";
    env.VOICE_API_SECRET = "test-secret";
    expect(authorize(request({ host: "127.0.0.1:3030" }))).toBe(true);
    expect(authorize(request({ host: "lindsay-voice.fly.dev" }))).toBe(false);
  });
});
