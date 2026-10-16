// deno test supabase/functions/forms/fetch_test.ts
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { allowed, fetchForm, MAX_HOPS, readCapped } from "./fetch.ts";

const PDF = new TextEncoder().encode("%PDF-1.7\n...");

/** A fake fetch that answers from a table of URL -> response maker, and records each URL and its redirect mode. */
function fakeFetch(routes: Record<string, () => Response>) {
  const calls: { url: string; redirect?: RequestRedirect }[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, redirect: init?.redirect });
    const make = routes[url];
    if (!make) throw new TypeError(`no route for ${url}`);
    return make();
  }) as typeof fetch;
  return { f, calls };
}
const redirect = (to: string, status = 302) => () => new Response(null, { status, headers: { location: to } });
const pdf = () => new Response(PDF, { status: 200, headers: { "content-type": "application/pdf" } });

Deno.test("only government hosts, https, no credentials or ports", () => {
  assert(allowed("https://www.irs.gov/pub/irs-pdf/fss4.pdf"));
  assertEquals(allowed("http://www.irs.gov/x.pdf")?.protocol, "https:");
  assert(allowed("https://sfplanning.org/x.pdf"));
  assert(allowed("https://www.sos.state.tx.us/corp/forms/205_boc.pdf"));
  assert(!allowed("https://evil.com/irs.gov.pdf"));
  assert(!allowed("https://irs.gov.evil.com/x.pdf"));
  assert(!allowed("https://user:pw@www.irs.gov/x.pdf"));
  assert(!allowed("https://www.irs.gov:8443/x.pdf"));
  assert(!allowed("ftp://www.irs.gov/x.pdf"));
});

Deno.test("redirects are followed by hand, each hop checked", async () => {
  const { f, calls } = fakeFetch({
    "https://www.irs.gov/a.pdf": redirect("/b.pdf", 301),
    "https://www.irs.gov/b.pdf": redirect("https://apps.irs.gov/c.pdf"),
    "https://apps.irs.gov/c.pdf": pdf,
  });
  const got = await fetchForm(new URL("https://www.irs.gov/a.pdf"), f);
  assert(got.ok);
  if (got.ok) assertEquals(got.url.href, "https://apps.irs.gov/c.pdf");
  assertEquals(calls.map((c) => c.redirect), ["manual", "manual", "manual"]);
});

Deno.test("a redirect off government hosts is refused before it is fetched", async () => {
  const { f, calls } = fakeFetch({
    "https://www.irs.gov/a.pdf": redirect("https://evil.example/steal"),
    "https://evil.example/steal": pdf,
  });
  const got = await fetchForm(new URL("https://www.irs.gov/a.pdf"), f);
  assert(!got.ok && got.code === "upstream_error" && got.zh.length > 0);
  assertEquals(calls.length, 1);
});

Deno.test("a redirect to an internal address is refused", async () => {
  const { f, calls } = fakeFetch({ "https://www.irs.gov/a.pdf": redirect("http://169.254.169.254/latest/meta-data") });
  const got = await fetchForm(new URL("https://www.irs.gov/a.pdf"), f);
  assert(!got.ok);
  assertEquals(calls.length, 1);
});

Deno.test("at most 5 redirects", async () => {
  const routes: Record<string, () => Response> = {};
  for (let i = 0; i < 10; i++) routes[`https://www.irs.gov/${i}.pdf`] = redirect(`https://www.irs.gov/${i + 1}.pdf`);
  const { f, calls } = fakeFetch(routes);
  const got = await fetchForm(new URL("https://www.irs.gov/0.pdf"), f);
  assert(!got.ok && /too many/.test(got.en));
  assertEquals(calls.length, MAX_HOPS + 1);
  // exactly 5 is fine
  const ok5: Record<string, () => Response> = {};
  for (let i = 0; i < 5; i++) ok5[`https://www.irs.gov/${i}.pdf`] = redirect(`https://www.irs.gov/${i + 1}.pdf`);
  ok5["https://www.irs.gov/5.pdf"] = pdf;
  assert((await fetchForm(new URL("https://www.irs.gov/0.pdf"), fakeFetch(ok5).f)).ok);
});

Deno.test("the size cap holds while streaming, even without a content-length", async () => {
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      pulled++;
      if (pulled > 1000) { c.close(); return; }
      c.enqueue(pulled === 1 ? PDF : new Uint8Array(1024));
    },
  });
  const { f } = fakeFetch({ "https://www.irs.gov/big.pdf": () => new Response(stream, { status: 200 }) });
  const got = await fetchForm(new URL("https://www.irs.gov/big.pdf"), f, 10 * 1024);
  assert(!got.ok && got.status === 413);
  assert(pulled < 50, `stopped reading early (read ${pulled} chunks)`);
});

Deno.test("a declared length over the cap is refused without reading", async () => {
  const res = new Response(PDF, { headers: { "content-length": String(20 * 1024 * 1024) } });
  assertEquals(await readCapped(res, 15 * 1024 * 1024), null);
});

Deno.test("not a PDF, or an error status, is refused", async () => {
  const { f } = fakeFetch({
    "https://www.irs.gov/page.pdf": () => new Response("<html>", { status: 200 }),
    "https://www.irs.gov/gone.pdf": () => new Response("no", { status: 404 }),
  });
  const a = await fetchForm(new URL("https://www.irs.gov/page.pdf"), f);
  assert(!a.ok && a.code === "not_pdf");
  const b = await fetchForm(new URL("https://www.irs.gov/gone.pdf"), f);
  assert(!b.ok && b.code === "upstream_error");
});
