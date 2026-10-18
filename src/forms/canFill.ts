import { MAPS } from "./maps";
import type { OfficialForm } from "./registry";
import { B } from "../bi";

/** Placetta writes the answers into this form's own PDF (the agency's file): SS-4 and CBP 5106 by code, the rest by box map. */
export const canFill = (off: Pick<OfficialForm, "id" | "fill"> | undefined): boolean => !!off && (!!off.fill || !!MAPS[off.id]);

/** The agency publishes no PDF for this form: it is filed on the agency's own site, so there is no paper form to fill. */
export const onlineOnly = (off: Pick<OfficialForm, "id" | "fill" | "pdf" | "method"> | undefined): boolean =>
  !!off && !canFill(off) && !off.pdf && (off.method === "online" || off.method === "portal");

/** What the app says for such a form, under its name. */
export const ONLINE_ONLY = B("This agency only takes it online; Placetta fills the portal.", "该机构只接受在线办理；快哉代您填写其网上系统。");
