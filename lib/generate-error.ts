export function generateErrorStatus(error: unknown, message: string): number {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status: unknown }).status);
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
  }
  if (message.includes("OPENAI_API_KEY") || message.includes("ANTHROPIC_API_KEY")) {
    return 503;
  }
  return 400;
}

export const DRAFT_ERROR = {
  noCredit: "Drafts are paused right now. Ask Lindsay to top up the AI account.",
  key: "Drafts aren't working right now. Ask Lindsay to check the AI key.",
  busy: "The AI service is busy. Try again in a minute.",
  server: "The AI service had a problem. Try again in a minute.",
  other: "Couldn't write a draft just now. Try again, or ask Lindsay if it keeps happening.",
} as const;

/**
 * The sentence the person drafting sees. The provider's raw reply never reaches them; the route
 * logs it instead. The 4-minute timeout message already reads plainly, so it passes through.
 */
export function publicDraftError(error: unknown, message: string): string {
  const status = generateErrorStatus(error, message);
  if (status === 504 && /timed out/i.test(message)) return message;
  if (/credit balance/i.test(message)) return DRAFT_ERROR.noCredit;
  if (status === 401 || status === 403 || /API_KEY|api key|x-api-key|authentication/i.test(message)) return DRAFT_ERROR.key;
  if (status === 429 || status === 529 || /overloaded|rate limit/i.test(message)) return DRAFT_ERROR.busy;
  if (status >= 500) return DRAFT_ERROR.server;
  return DRAFT_ERROR.other;
}
