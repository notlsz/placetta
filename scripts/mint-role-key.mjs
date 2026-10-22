#!/usr/bin/env node
/* Makes the portal filer's own API key: a JWT for the database role placetta_filer, signed with the project's JWT
   secret, the same way Supabase's own anon and service_role keys are made. Run it on the founder's computer, paste the
   output straight into Render's FILER_DB_KEY, and don't save it anywhere else: docs/soc2/runbooks/filer-least-privilege.md.

   Usage: SUPABASE_JWT_SECRET=... node scripts/mint-role-key.mjs --ref esquxzcfsylffuijvzec [--role placetta_filer] [--days 365]
   The secret is read from the environment only, never an argument (arguments end up in shell history). */
import { createHmac } from "node:crypto";

const b64url = (b) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

export function mint({ secret, ref, role = "placetta_filer", days = 365, now = Math.floor(Date.now() / 1000) }) {
  if (!secret || secret.length < 32) throw new Error("SUPABASE_JWT_SECRET is missing or too short");
  if (!/^[a-z0-9]{20}$/.test(ref ?? "")) throw new Error("--ref must be the 20-character project ref");
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error("--role is not a plain role name");
  if (["service_role", "postgres", "supabase_admin", "authenticator"].includes(role)) throw new Error(`refusing to mint a key for ${role}`);
  if (!(days > 0 && days <= 400)) throw new Error("--days must be 1 to 400");
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: "supabase", ref, role, iat: now, exp: now + Math.round(days * 86400) }));
  const sig = b64url(createHmac("sha256", secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  try {
    const key = mint({ secret: process.env.SUPABASE_JWT_SECRET, ref: get("--ref"), role: get("--role") ?? "placetta_filer", days: Number(get("--days") ?? 365) });
    const exp = new Date(JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).exp * 1000).toISOString().slice(0, 10);
    process.stderr.write(`Key for role ${get("--role") ?? "placetta_filer"}, expires ${exp}. Put a reminder to replace it before then.\n`);
    process.stdout.write(key + "\n");
  } catch (e) { console.error(`mint-role-key: ${e.message}`); process.exit(1); }
}
