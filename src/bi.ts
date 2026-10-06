/** Every string the person sees comes in English and Chinese. Kept apart from model.ts so the agent's core (which also
 *  runs on the server) doesn't pull in the sample workspace. */
export type Bi = { en: string; zh: string };
export const B = (en: string, zh: string): Bi => ({ en, zh });
export const same = (s: string): Bi => ({ en: s, zh: s });
