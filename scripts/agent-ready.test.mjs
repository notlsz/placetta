// node --test scripts/agent-ready.test.mjs: the Markdown copies and the feeds (scripts/agent-ready.mjs) on a small built site.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, toMarkdown } from "./agent-ready.mjs";

test("a page's content as Markdown, without scripts, navigation, forms or hidden blocks", () => {
  const md = toMarkdown(`<html><head><title>x</title></head><body><nav><a href="/">Home</a></nav><main>
    <h1>Opening a tea shop in <em>Flushing</em></h1><p>Four filings, in order. <a href="/guides/">All guides</a> &amp; more.</p>
    <script>alert(1)</script><form><input name="q"><button>Go</button></form>
    <ul><li>EIN <b>free</b></li><li>Permit</li></ul>
    <table><tr><th>Filing</th><th>Fee</th></tr><tr><td>Permit</td><td>$280</td></tr></table>
    <article hidden><p>中文</p></article><p><a href="javascript:alert(1)">bad</a></p></main><footer>foot</footer></body></html>`);
  assert.match(md, /^# Opening a tea shop in \*Flushing\*$/m);
  assert.match(md, /Four filings, in order\. \[All guides\]\(https:\/\/www\.placetta\.com\/guides\/\) & more\./);
  assert.match(md, /^- EIN \*\*free\*\*\n- Permit$/m);
  assert.match(md, /\| Filing \| Fee \|\n\| --- \| --- \|\n\| Permit \| \$280 \|/);
  for (const gone of ["alert", "Home", "foot", "中文", "Go", "javascript"]) assert.ok(!md.includes(gone), gone);
});

test("every indexed page gets its copy and the links; the feeds carry news first and newest", () => {
  const d = mkdtempSync(join(tmpdir(), "agent-ready-"));
  const page = (path, title, modified, extra = "") => {
    mkdirSync(join(d, path, ".."), { recursive: true });
    writeFileSync(join(d, path), `<html><head><title>${title}</title><meta name="description" content="About ${title}"><link rel="canonical" href="https://www.placetta.com${path.replace(/index\.html$/, "")}">${extra}
<script type="application/ld+json">{"@type":"Article","datePublished":"2026-01-01","dateModified":"${modified}"}</script></head><body><main><h1>${title}</h1><p>Body of ${title}.</p></main></body></html>`);
  };
  page("/index.html", "Placetta", "2026-10-01");
  page("/news/funding/index.html", "Funding", "2026-06-21");
  page("/guides/nyc/tea.html", "Tea in NYC", "2026-10-20");
  page("/help/team/invite/index.html", "Invite", "2026-10-21");
  page("/guides/zh/nyc/tea.html", "纽约茶饮", "2026-10-22");
  page("/hidden.html", "Hidden", "2026-10-22", '<meta name="robots" content="noindex">');
  mkdirSync(join(d, "app"), { recursive: true }); writeFileSync(join(d, "app", "index.html"), "<html><head></head><body>app</body></html>");
  const r = run(d);
  assert.equal(r.pages, 5);
  assert.match(readFileSync(join(d, "guides/nyc/tea.md"), "utf8"), /^# Tea in NYC\n\nSource: https:\/\/www\.placetta\.com\/guides\/nyc\/tea\.html\nLast changed: 2026-10-20\n\n> About Tea in NYC\n\n# Tea in NYC\n\nBody of Tea in NYC\.\n$/);
  assert.match(readFileSync(join(d, "guides/nyc/tea.html"), "utf8"), /<link rel="alternate" type="text\/markdown" href="\/guides\/nyc\/tea\.md">\n<link rel="alternate" type="application\/atom\+xml"[^>]*href="\/feed\.xml">\n/);
  assert.ok(readFileSync(join(d, "help/team/invite/index.md"), "utf8").includes("Body of Invite."));
  // a page that leaves out </head> still gets its links
  writeFileSync(join(d, "x.html"), '<html><title>X</title><link rel="canonical" href="https://www.placetta.com/x.html"><body><main><p>x</p></main>'); run(d);
  assert.match(readFileSync(join(d, "x.html"), "utf8"), /canonical[^>]*>\n<link rel="alternate" type="text\/markdown" href="\/x\.md">/);
  assert.ok(!readFileSync(join(d, "app/index.html"), "utf8").includes("text/markdown"), "the app is left alone");
  assert.ok(!readFileSync(join(d, "hidden.html"), "utf8").includes("text/markdown"), "noindex pages get no copy");
  const atom = readFileSync(join(d, "feed.xml"), "utf8");
  assert.deepEqual([...atom.matchAll(/<entry>\n<title>([^<]*)</g)].map(m => m[1]), ["Invite", "Tea in NYC", "Funding"]);
  assert.match(atom, /<updated>2026-10-21T00:00:00Z<\/updated>/);
  const rss = readFileSync(join(d, "rss.xml"), "utf8");
  assert.equal([...rss.matchAll(/<item>/g)].length, 3);
  assert.match(rss, /<guid isPermaLink="true">https:\/\/www\.placetta\.com\/news\/funding\/<\/guid>/);
  // a second run changes nothing (the links aren't added twice)
  const before = readFileSync(join(d, "guides/nyc/tea.html"), "utf8"); run(d);
  assert.equal(readFileSync(join(d, "guides/nyc/tea.html"), "utf8"), before);
});
