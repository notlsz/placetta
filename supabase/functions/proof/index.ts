// proof: opens a document a shared proof link shares (src/Proof.tsx, 20261106090000_risk_and_proof.sql).
// GET ?t=<token>&d=<document id>. Deployed with verify_jwt off: the unguessable token is the credential. The database
// (proof_doc) decides: a live link that shares documents, and only a document of that filing that Placetta, the team or
// the agency made. The answer is a redirect to a 5-minute signed address; anything else is the same 404.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { docOk, pathOk, SIGNED_SECONDS, tokenOk } from "./logic.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const gone = () => new Response("This link has expired or was turned off.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } });
  const u = new URL(req.url);
  const t = u.searchParams.get("t"), d = u.searchParams.get("d");
  if (!tokenOk(t) || !docOk(d)) return gone();
  const { data: path, error } = await admin.rpc("proof_doc", { p_token: t, p_doc: d });
  if (error || !pathOk(path)) return gone();
  const s = await admin.storage.from("documents").createSignedUrl(path, SIGNED_SECONDS);
  if (s.error || !s.data?.signedUrl) return gone();
  return new Response(null, { status: 302, headers: { Location: s.data.signedUrl, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
});
