import { PREVIEW, supabase } from "./api";

/* Two owners for one filing, when a business rule asks for it (src/businessRules.ts): each owner's approval is a row in
   owner_approvals, written as themselves (the database lets an owner write only their own). When the filing goes in,
   the database counts two different owners again before it takes it (supabase/migrations/*_odelia_controls.sql). */
export async function ownerApprove(ws: string, app: string): Promise<void> {
  if (PREVIEW) return;   // the in-browser preview has no database behind it
  const { error } = await supabase().from("owner_approvals").upsert({ workspace_id: ws, app_id: app }, { onConflict: "workspace_id,app_id,user_id", ignoreDuplicates: true });
  if (error) throw { code: error.code ?? "db_error", message: error.message };
}
