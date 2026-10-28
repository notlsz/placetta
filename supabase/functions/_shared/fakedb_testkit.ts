// Test kit: an in-memory stand-in for the slice of supabase-js the messaging functions use (from/select/insert/update/
// upsert/delete with eq, is, not, in, gt, gte, lt, order, limit, maybeSingle, single, and rpc), so a handler runs end to
// end against plain arrays (odelia-sms/index_test.ts). Unique keys are declared per table so a repeated insert fails
// the way Postgres's would (23505). Never imported by a server function.
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;
type Rpc = (args: Record<string, unknown>, db: FakeDb) => unknown;

const cmp = (a: unknown, b: unknown) => String(a ?? "") < String(b ?? "") ? -1 : String(a ?? "") > String(b ?? "") ? 1 : 0;

export class FakeDb {
  tables: Record<string, Row[]> = {};
  unique: Record<string, string[][]> = {};
  rpcs: Record<string, Rpc> = {};
  calls: { table: string; op: string; values?: unknown }[] = [];
  private seq = 1;
  rows(t: string) { return (this.tables[t] ??= []); }
  from(table: string) { return new Query(this, table); }
  rpc(name: string, args: Record<string, unknown> = {}) {
    const f = this.rpcs[name];
    if (!f) return Promise.resolve({ data: null, error: { code: "PGRST202", message: `no ${name}` } });
    try { return Promise.resolve({ data: f(args, this) ?? null, error: null }); } catch (e) { return Promise.resolve({ data: null, error: { code: "P0001", message: String((e as Error).message) } }); }
  }
  /** Adds the defaults Postgres would: an id and created_at. */
  fill(t: string, r: Row): Row {
    return { id: t === "odelia_messages" ? this.seq++ : crypto.randomUUID(), created_at: new Date().toISOString(), ...r };
  }
  clash(t: string, r: Row, except?: Row): boolean {
    return (this.unique[t] ?? []).some((cols) => cols.every((c) => r[c] != null) && this.rows(t).some((x) => x !== except && cols.every((c) => x[c] === r[c])));
  }
}

class Query implements PromiseLike<{ data: unknown; error: unknown; count?: number | null }> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private values: Row | Row[] | null = null;
  private opts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private returning = false;
  private head = false;
  private counting = false;
  private one: "maybe" | "single" | null = null;
  private sort: [string, boolean][] = [];
  private max = Infinity;
  constructor(private db: FakeDb, private table: string) {}
  select(_cols?: string, o: { count?: string; head?: boolean } = {}) { if (this.op !== "select") this.returning = true; this.head = !!o.head; this.counting = !!o.count; return this; }
  insert(v: Row | Row[]) { this.op = "insert"; this.values = v; return this; }
  update(v: Row) { this.op = "update"; this.values = v; return this; }
  upsert(v: Row | Row[], o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) { this.op = "upsert"; this.values = v; this.opts = o; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  is(c: string, v: null | boolean) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  not(c: string, op: string, v: unknown) { this.filters.push((r) => !(op === "is" ? (r[c] ?? null) === v : r[c] === v)); return this; }
  in(c: string, v: unknown[]) { this.filters.push((r) => v.includes(r[c])); return this; }
  gt(c: string, v: unknown) { this.filters.push((r) => cmp(r[c], v) > 0); return this; }
  gte(c: string, v: unknown) { this.filters.push((r) => cmp(r[c], v) >= 0); return this; }
  lt(c: string, v: unknown) { this.filters.push((r) => cmp(r[c], v) < 0); return this; }
  lte(c: string, v: unknown) { this.filters.push((r) => cmp(r[c], v) <= 0); return this; }
  or(_s: string) { return this; }
  order(c: string, o: { ascending?: boolean } = {}) { this.sort.push([c, o.ascending !== false]); return this; }
  limit(n: number) { this.max = n; return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  single() { this.one = "single"; return this; }
  then<A, B>(ok?: ((v: { data: unknown; error: unknown; count?: number | null }) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.run()).then(ok, bad);
  }
  private match() { return this.db.rows(this.table).filter((r) => this.filters.every((f) => f(r))); }
  private out(rows: Row[]) {
    let list = [...rows];
    for (const [c, asc] of [...this.sort].reverse()) list.sort((a, b) => (asc ? 1 : -1) * cmp(a[c], b[c]));
    list = list.slice(0, this.max);
    if (this.one) {
      if (this.one === "single" && list.length !== 1) return { data: null, error: { code: "PGRST116", message: "not one row" } };
      return { data: list[0] ?? null, error: null };
    }
    return { data: this.head ? null : list, error: null, count: this.counting ? list.length : null };
  }
  private run() {
    const t = this.table, db = this.db;
    db.calls.push({ table: t, op: this.op, values: this.values ?? undefined });
    if (this.op === "select") return this.out(this.match());
    if (this.op === "delete") { const gone = new Set(this.match()); db.tables[t] = db.rows(t).filter((r) => !gone.has(r)); return { data: null, error: null }; }
    if (this.op === "update") {
      const hit = this.match();
      for (const r of hit) Object.assign(r, this.values);
      return this.returning ? this.out(hit) : { data: null, error: null };
    }
    const rows = (Array.isArray(this.values) ? this.values : [this.values!]).map((r) => ({ ...r }));
    const done: Row[] = [];
    for (const r of rows) {
      if (this.op === "upsert") {
        const keys = (this.opts.onConflict ?? "id").split(",").map((s) => s.trim());
        const old = db.rows(t).find((x) => keys.every((k) => x[k] === r[k]));
        if (old) { if (!this.opts.ignoreDuplicates) { Object.assign(old, r); done.push(old); } continue; }
      }
      const full = db.fill(t, r);
      if (db.clash(t, full)) {
        if (this.op === "upsert" && this.opts.ignoreDuplicates) continue;
        return { data: null, error: { code: "23505", message: "duplicate key" } };
      }
      db.rows(t).push(full); done.push(full);
    }
    return this.returning ? this.out(done) : { data: null, error: null };
  }
}
