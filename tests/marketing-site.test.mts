import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("marketing translations stay aligned", async () => {
  const [en, he] = await Promise.all([
    read("src/messages/en.json").then(JSON.parse),
    read("src/messages/he.json").then(JSON.parse),
  ]);
  assert.deepEqual(Object.keys(en.Marketing).sort(), Object.keys(he.Marketing).sort());
});

test("public marketing surface stays tenantless", async () => {
  const paths = [
    "src/app/page.tsx",
    "src/app/(marketing)/_components/MarketingHeader.tsx",
    "src/app/(marketing)/_components/MarketingFooter.tsx",
  ];
  const sources = await Promise.all(paths.map(read));
  const source = sources.join("\n");
  assert.doesNotMatch(source, /@\/drizzle\/db|@\/lib\/tenant-context|@\/lib\/tenant\b/);
  assert.doesNotMatch(source, /TenantLink/);
});

test("marketing CTAs target public acquisition routes", async () => {
  const sources = await Promise.all([
    read("src/app/(marketing)/_components/MarketingHeader.tsx"),
    read("src/app/(marketing)/_components/HeroSection.tsx"),
  ]);
  const source = sources.join("\n");
  assert.match(source, /href="\/signup"/);
  assert.match(source, /href="\/login"/);
  assert.match(source, /href="\/examples"/);
  assert.match(source, /min-h-11/);
});
