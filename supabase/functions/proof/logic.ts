// The proof function's rules, kept apart so they're tested without a network (logic_test.ts).

/** A proof link's token: 48 lowercase hex characters (proof_link_create). Anything else is refused before the database. */
export const tokenOk = (t: string | null | undefined): t is string => typeof t === "string" && /^[0-9a-f]{48}$/.test(t);
/** A document id: a UUID. */
export const docOk = (d: string | null | undefined): d is string => typeof d === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d);
/** How long a signed document address lasts: long enough to open it, short enough that a forwarded address dies. */
export const SIGNED_SECONDS = 300;
/** A storage path the proof may sign: a workspace's own file, never a path that climbs out of it. */
export const pathOk = (p: unknown): p is string => typeof p === "string" && /^[0-9a-f-]{36}\/[^\0]+$/i.test(p) && !p.includes("..");
