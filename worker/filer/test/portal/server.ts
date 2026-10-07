// A small agency portal for tests: login, three form pages, an upload, a review page, a submit that returns a
// confirmation number, and variants with a CAPTCHA, card fields, or a review page that differs from what was entered.
import { createServer, type Server } from "node:http";

export type Variant = { captcha?: boolean; pay?: boolean; alter?: boolean };
export type Portal = { url: string; submissions: number; close(): Promise<void>; variant: Variant };

const page = (title: string, body: string) => `<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>`;
const field = (id: string, label: string, v = "") => `<p><label for="${id}">${label}</label><input id="${id}" name="${id}" value="${v}"></p>`;

export async function startPortal(variant: Variant = {}): Promise<Portal> {
  const data: Record<string, string> = {};
  let authed = false;
  const p: Portal = { url: "", submissions: 0, variant, close: () => new Promise((r) => srv.close(() => r())) };
  const srv: Server = createServer(async (req, res) => {
    const u = new URL(req.url!, "http://x");
    let body = "";
    for await (const c of req) body += c;
    const form = Object.fromEntries(new URLSearchParams(body));
    if (req.headers["content-type"]?.startsWith("multipart")) {
      data.upload = /filename="([^"]+)"/.exec(body)?.[1] ?? "";
      for (const m of body.matchAll(/name="(\w+)"\r\n\r\n([^\r]*)\r\n/g)) data[m[1]] = m[2];
    } else Object.assign(data, form);
    const go = (to: string) => { res.writeHead(303, { location: to }); res.end(); };
    const html = (h: string) => { res.writeHead(200, { "content-type": "text/html" }); res.end(h); };
    const f = (action: string, inner: string, button = "Continue", enc = "") => `<form method="post" action="${action}"${enc}>${inner}<button type="submit">${button}</button></form>`;
    switch (u.pathname) {
      case "/": return html(page("Sign in", f("/login", `${field("user", "Username")}<p><label for="pw">Password</label><input id="pw" name="pw" type="password"></p>`, "Sign in")));
      case "/login": if (form.user === "demo" && form.pw === "s3cret") { authed = true; return go("/business"); } return go("/");
      case "/business": if (!authed) return go("/");
        return html(page("Business", (variant.captcha ? `<div class="g-recaptcha"></div>` : "") + f("/owner", field("name", "Legal name") + field("addr", "Business address"))));
      case "/owner": return html(page("Owner", f("/activity", field("owner", "Owner name") + field("otitle", "Title"))));
      case "/activity": return html(page("Activity", f("/review", `<p><label for="act">Activity</label><select id="act" name="act"><option></option><option>Restaurant</option><option>Retail</option></select></p><p><label for="doc">Articles</label><input id="doc" name="doc" type="file"></p>`, "Continue", ` enctype="multipart/form-data"`)));
      case "/review": {
        const name = variant.alter ? (data.name ?? "") + " Holdings" : data.name;
        const shown = variant.alter ? "Someone Else LLC" : name;
        return html(page("Review", `<p>Legal name: ${shown}</p><p>Business address: ${data.addr}</p><p>Owner name: ${data.owner}</p><p>Title: ${data.otitle}</p><p>Activity: ${data.act}</p><p>File: ${data.upload}</p>` + f(variant.pay ? "/pay" : "/submit", "", "Submit filing")));
      }
      case "/pay": return html(page("Pay the fee", f("/submit", `<p><label for="cc">Card number</label><input id="cc" name="cc" autocomplete="cc-number"></p>`, "Pay")));
      case "/submit": p.submissions++; return html(page("Filed", `<p>Thank you.</p><p>Confirmation number: CA-${String(10000 + p.submissions)}</p>`));
      default: res.writeHead(404); res.end();
    }
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  const a = srv.address(); p.url = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
  return p;
}
