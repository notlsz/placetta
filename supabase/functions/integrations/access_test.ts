// deno test supabase/functions/integrations/access_test.ts
import { ok as assert } from "node:assert";
import { mayRead, READ_REFUSED } from "./access.ts";

const OWNER = "11111111-1111-1111-1111-111111111111", MEMBER = "22222222-2222-2222-2222-222222222222";

Deno.test("an owner reads any connected account", () => {
  assert(mayRead("owner", { connected_by: MEMBER }, OWNER));
  assert(mayRead("owner", { connected_by: null }, OWNER));
});
Deno.test("a member reads only what they connected", () => {
  assert(mayRead("member", { connected_by: MEMBER }, MEMBER));
  assert(!mayRead("member", { connected_by: OWNER }, MEMBER));
  assert(!mayRead("member", { connected_by: null }, MEMBER));
  assert(!mayRead("member", {}, MEMBER));
});
Deno.test("anyone else reads nothing", () => {
  assert(!mayRead("staff", { connected_by: MEMBER }, MEMBER));
  assert(!mayRead("none", { connected_by: MEMBER }, MEMBER));
  assert(!mayRead("", { connected_by: MEMBER }, MEMBER));
});
Deno.test("the refusal is in both languages", () => {
  assert(READ_REFUSED.en.length > 0 && READ_REFUSED.zh.length > 0);
});
