import { assert, assertFalse } from "jsr:@std/assert@1";
import { docOk, pathOk, SIGNED_SECONDS, tokenOk } from "./logic.ts";

Deno.test("a token is 48 lowercase hex characters, nothing else", () => {
  assert(tokenOk("a".repeat(48)));
  assertFalse(tokenOk("A".repeat(48)));
  assertFalse(tokenOk("a".repeat(47)));
  assertFalse(tokenOk("a".repeat(48) + "' or 1=1"));
  assertFalse(tokenOk(null));
});
Deno.test("a document id is a UUID", () => {
  assert(docOk("0d56f788-06fb-40ee-b5c9-a72ed5f5637e"));
  assertFalse(docOk("../../etc/passwd"));
  assertFalse(docOk(""));
});
Deno.test("only a workspace's own path is signed, never one that climbs out", () => {
  assert(pathOk("0d56f788-06fb-40ee-b5c9-a72ed5f5637e/receipts/x.pdf"));
  assertFalse(pathOk("0d56f788-06fb-40ee-b5c9-a72ed5f5637e/../other/x.pdf"));
  assertFalse(pathOk("receipts/x.pdf"));
  assertFalse(pathOk(null));
});
Deno.test("a signed address dies within 5 minutes", () => assert(SIGNED_SECONDS <= 300));
