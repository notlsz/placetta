// The local stack for the end-to-end test: a throwaway Postgres cluster with every migration applied, PostgREST in
// front of it, JWTs signed with the test secret, and a stand-in for the Supabase gateway at 127.0.0.1:54321.
import postgres from "npm:postgres@3.4.5";

export const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
export const JWT_SECRET = "e2e-jwt-secret-that-is-long-enough-for-hs256-0123456789";
export const PROD_URL = "https://esquxzcfsylffuijvzec.supabase.co";

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = new TextEncoder();

/* ------------------------------ JWTs ------------------------------ */

let hmacKey: CryptoKey | null = null;
async function key() {
  hmacKey ??= await crypto.subtle.importKey("raw", enc.encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return hmacKey;
}
export async function signJwt(claims: Record<string, unknown>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(enc.encode(JSON.stringify({ iat: now, exp: now + 6 * 3600, iss: "supabase-e2e", ...claims })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}
export async function verifyJwt(token: string): Promise<Record<string, unknown> | null> {
  const [h, b, s] = String(token ?? "").split(".");
  if (!h || !b || !s) return null;
  const pad = (x: string) => x.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((x.length + 3) % 4);
  try {
    const sig = Uint8Array.from(atob(pad(s)), (c) => c.charCodeAt(0));
    if (!(await crypto.subtle.verify("HMAC", await key(), sig, enc.encode(`${h}.${b}`)))) return null;
    const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(pad(b)), (c) => c.charCodeAt(0))));
    if (typeof claims.exp === "number" && claims.exp < Date.now() / 1000) return null;
    return claims;
  } catch { return null; }
}
export const userJwt = (u: { id: string; email: string }, aal: "aal1" | "aal2" = "aal1") =>
  signJwt({ sub: u.id, role: "authenticated", aud: "authenticated", email: u.email, aal, session_id: crypto.randomUUID(), amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }] });

/* ------------------------------ processes ------------------------------ */

async function run(cmd: string, args: string[], o: { asPostgres?: boolean; env?: Record<string, string>; cwd?: string; stdin?: string } = {}) {
  const root = Deno.uid() === 0;
  const [c, a] = o.asPostgres && root ? ["runuser", ["-u", "postgres", "--", cmd, ...args]] : [cmd, args];
  const p = new Deno.Command(c, { args: a, env: o.env, cwd: o.cwd, stdin: o.stdin ? "piped" : "null", stdout: "piped", stderr: "piped" }).spawn();
  if (o.stdin) { const w = p.stdin.getWriter(); await w.write(enc.encode(o.stdin)); await w.close(); }
  const out = await p.output();
  const text = new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr);
  if (!out.success) throw new Error(`${cmd} ${args.join(" ")} failed:\n${text.slice(-3000)}`);
  return text;
}

async function freePort(): Promise<number> {
  const l = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const p = (l.addr as Deno.NetAddr).port;
  l.close();
  return p;
}

async function pgBin(): Promise<string> {
  if (Deno.env.get("PG_BIN")) return Deno.env.get("PG_BIN")!;
  for (const v of ["17", "16", "15"]) { try { await Deno.stat(`/usr/lib/postgresql/${v}/bin/initdb`); return `/usr/lib/postgresql/${v}/bin`; } catch { /* next */ } }
  return (await run("pg_config", ["--bindir"])).trim();
}

const PGRST_VERSION = "v12.2.12";
async function postgrestBin(): Promise<string> {
  if (Deno.env.get("PGRST_BIN")) return Deno.env.get("PGRST_BIN")!;
  const dir = `${ROOT}/node_modules/.cache/placetta-e2e`;
  const bin = `${dir}/postgrest-${PGRST_VERSION}`;
  try { await Deno.stat(bin); return bin; } catch { /* download it */ }
  await Deno.mkdir(`${dir}/dl`, { recursive: true });
  const url = `https://github.com/PostgREST/postgrest/releases/download/${PGRST_VERSION}/postgrest-${PGRST_VERSION}-linux-static-x86-64.tar.xz`;
  console.log(`  downloading PostgREST ${PGRST_VERSION}`);
  await run("curl", ["-fsSL", "-o", `${dir}/dl/postgrest.tar.xz`, url]);
  await run("tar", ["-xJf", `${dir}/dl/postgrest.tar.xz`, "-C", `${dir}/dl`]);
  await Deno.rename(`${dir}/dl/postgrest`, bin);
  await Deno.remove(`${dir}/dl`, { recursive: true });
  return bin;
}

export type Stack = {
  sql: ReturnType<typeof postgres>;
  dbUrl: string;
  pgPort: number;
  restPort: number;
  stop: () => Promise<void>;
};

/** initdb into a temp dir (as the postgres user when we're root), apply the stubs and every migration, start PostgREST. */
export async function startStack(log: (s: string) => void): Promise<Stack> {
  const bin = await pgBin();
  const dir = await Deno.makeTempDir({ prefix: "placetta-e2e-" });
  if (Deno.uid() === 0) {
    const uid = Number((await run("id", ["-u", "postgres"])).trim()), gid = Number((await run("id", ["-g", "postgres"])).trim());
    await Deno.chown(dir, uid, gid);
  }
  const pgPort = await freePort();
  const stops: (() => Promise<void>)[] = [];
  const stop = async () => { for (const s of stops.reverse()) await s().catch((e) => console.error("teardown:", String(e).slice(0, 200))); };
  try {
    await run(`${bin}/initdb`, ["-D", `${dir}/data`, "--auth=trust", "-U", "postgres", "-E", "UTF8", "--locale=C"], { asPostgres: true });
    await run(`${bin}/pg_ctl`, ["-D", `${dir}/data`, "-w", "-l", `${dir}/postgres.log`, "-o", `-p ${pgPort} -k ${dir} -c listen_addresses=127.0.0.1 -c fsync=off -c timezone=UTC`, "start"], { asPostgres: true });
    stops.push(async () => {
      await run(`${bin}/pg_ctl`, ["-D", `${dir}/data`, "-m", "immediate", "-w", "stop"], { asPostgres: true });
      await Deno.remove(dir, { recursive: true });
    });
    log(`postgres on 127.0.0.1:${pgPort}`);
    const dbUrl = `postgres://postgres@127.0.0.1:${pgPort}/postgres`;
    const psql = (file: string, stdin?: string) => run("psql", ["-q", "-X", "-v", "ON_ERROR_STOP=1", "-d", dbUrl, "-f", file], { stdin });
    await psql(`${ROOT}/supabase/tests/supabase_stubs.sql`);
    const files = [...Deno.readDirSync(`${ROOT}/supabase/migrations`)].map((f) => f.name).filter((n) => n.endsWith(".sql")).sort();
    for (const f of files) {
      // pg_net isn't installed here: the stubs give a net.http_post that queues the request instead
      const body = Deno.readTextFileSync(`${ROOT}/supabase/migrations/${f}`).replace(/create extension if not exists pg_net[^;]*;/gi, "");
      await psql("-", body);
    }
    log(`applied ${files.length} migrations`);
    // PostgREST logs in as authenticator and switches to the role in the JWT, as on Supabase.
    await psql("-", `do $$ begin if not exists (select 1 from pg_roles where rolname = 'authenticator') then
      create role authenticator login noinherit; end if; end $$;
      grant anon, authenticated, service_role to authenticator;`);

    const restPort = await freePort();
    const pgrst = new Deno.Command(await postgrestBin(), {
      env: {
        PGRST_DB_URI: `postgres://authenticator@127.0.0.1:${pgPort}/postgres`, PGRST_DB_SCHEMAS: "public", PGRST_DB_ANON_ROLE: "anon",
        PGRST_JWT_SECRET: JWT_SECRET, PGRST_SERVER_PORT: String(restPort), PGRST_SERVER_HOST: "127.0.0.1", PGRST_DB_EXTRA_SEARCH_PATH: "public, extensions",
        PGRST_DB_MAX_ROWS: "1000", PGRST_LOG_LEVEL: "error", PGRST_DB_POOL: "20",
      },
      stdout: "piped", stderr: "piped",
    }).spawn();
    const pgrstLog: string[] = [];
    const drain = async (s: ReadableStream<Uint8Array>) => { for await (const c of s.pipeThrough(new TextDecoderStream())) pgrstLog.push(c); };
    void drain(pgrst.stdout); void drain(pgrst.stderr);
    stops.push(async () => { try { pgrst.kill("SIGTERM"); } catch { /* gone */ } await pgrst.status; });
    for (let i = 0; ; i++) {
      const ok = await fetch(`http://127.0.0.1:${restPort}/`).then((r) => { void r.body?.cancel(); return r.status < 500; }).catch(() => false);
      if (ok) break;
      if (i > 100) throw new Error("PostgREST didn't start:\n" + pgrstLog.join("").slice(-2000));
      await new Promise((r) => setTimeout(r, 100));
    }
    log(`postgrest on 127.0.0.1:${restPort}`);
    const sql = postgres(dbUrl, { max: 4, onnotice: () => {} });
    stops.push(async () => { await sql.end({ timeout: 2 }); });
    return { sql, dbUrl, pgPort, restPort, stop };
  } catch (e) {
    await stop();
    throw e;
  }
}
