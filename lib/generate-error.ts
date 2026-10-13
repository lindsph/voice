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
