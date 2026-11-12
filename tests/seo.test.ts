import { test } from "node:test";
import assert from "node:assert/strict";
import {
  publicOrigin,
  publicMetadata,
  publicContactEmail,
  privatePaths,
} from "../src/lib/seo";
import robots from "../src/app/robots";
import sitemap from "../src/app/sitemap";
import config from "../next.config";
test("SEO uses a controlled HTTPS origin and disables public indexing on staging", async () => {
  const keys = [
    "PUBLIC_SITE_URL",
    "SITE_INDEXING_ENABLED",
    "PUBLIC_CONTACT_EMAIL",
  ] as const;
  const old = { ...process.env };
  try {
    for (const k of keys) delete process.env[k];
    assert.equal(publicOrigin(), "https://vashisht-travelos.onrender.com");
    process.env.PUBLIC_SITE_URL = "https://travelos.example/";
    assert.equal(publicOrigin(), "https://travelos.example");
    for (const bad of [
      "http://travelos.example",
      "https://u:p@travelos.example",
      "https://travelos.example/evil",
      "https://travelos.example/?x=1",
    ]) {
      process.env.PUBLIC_SITE_URL = bad;
      assert.throws(publicOrigin);
    }
    process.env.PUBLIC_SITE_URL = "https://travelos.example";
    assert.ok(
      sitemap().every((x) => x.url.startsWith("https://travelos.example")),
    );
    assert.ok(
      !sitemap().some((x) =>
        privatePaths.some((p) => new URL(x.url).pathname === p),
      ),
    );
    process.env.SITE_INDEXING_ENABLED = "false";
    assert.deepEqual(sitemap(), []);
    assert.deepEqual(robots().rules, { userAgent: "*", disallow: "/" });
    assert.deepEqual(
      publicMetadata("/features", "Features", "Description").robots,
      { index: false, follow: false },
    );
    const headers = await config.headers!();
    assert.ok(
      headers.some(
        (h) =>
          h.source === "/:path*" &&
          h.headers.some(
            (x) => x.key === "X-Robots-Tag" && x.value.includes("noindex"),
          ),
      ),
    );
    process.env.PUBLIC_CONTACT_EMAIL =
      "broken@example.test\r\nBcc:other@example.test";
    assert.equal(publicContactEmail(), null);
  } finally {
    for (const k of keys) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
  }
});
