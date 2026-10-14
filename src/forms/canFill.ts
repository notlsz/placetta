import { MAPS } from "./maps";
import type { OfficialForm } from "./registry";

/** Placetta writes the answers into this form's own PDF (the agency's file): SS-4 and CBP 5106 by code, the rest by box map. */
export const canFill = (off: Pick<OfficialForm, "id" | "fill"> | undefined): boolean => !!off && (!!off.fill || !!MAPS[off.id]);
