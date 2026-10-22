/** What the app gets back from a model call: the answer's blocks and why it stopped. The vendor's message id, the model
 *  that answered, the token counts and anything else a vendor adds stay on the server (ai_events, the team's Replay):
 *  a customer's browser has no use for them, and they'd show anyone with F12 which models Placetta runs. */
export function clientAnswer(d: unknown): { content: unknown[]; stop_reason: string } {
  const x = (d ?? {}) as { content?: unknown; stop_reason?: unknown };
  return { content: Array.isArray(x.content) ? x.content : [], stop_reason: typeof x.stop_reason === "string" ? x.stop_reason : "end_turn" };
}
