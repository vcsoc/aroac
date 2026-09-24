const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { createDemo, wonders } = require("../desktop/demo.cjs");
const { createApp } = require("../desktop/generated/local-service.cjs");
const options = {
  citiesPath: path.resolve(__dirname, "../data/cities.json"),
  defaultSourcesPath: path.resolve(__dirname, "../sources.yaml"),
  localKey: randomBytes(32).toString("hex"),
  isOffline: () => true,
};
test("demo seeds disposable wonders and never uses the station database", async () => {
  const first = createDemo(createApp, options);
  try {
    assert.equal(
      first.db.prepare("SELECT count(*) AS n FROM pins").get().n,
      wonders.length,
    );
    assert.equal(
      first.db.prepare("SELECT count(*) AS n FROM users").get().n,
      1,
    );
    assert.equal(
      first.db.prepare("SELECT callsign FROM users").get().callsign,
      "DEMO",
    );
    const server = first.app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    try {
      const response = await fetch(
        `http://127.0.0.1:${server.address().port}/api/pins`,
        {
          headers: {
            "X-OAR-Local-Key": options.localKey,
            "X-OAR-Client": "native",
            Authorization: `Bearer ${first.token}`,
          },
        },
      );
      assert.equal(response.status, 200);
      assert.equal((await response.json()).length, wonders.length);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    first.db.prepare("DELETE FROM pins").run();
  } finally {
    first.db.close();
  }
  const second = createDemo(createApp, options);
  try {
    assert.equal(
      second.db.prepare("SELECT count(*) AS n FROM pins").get().n,
      wonders.length,
    );
  } finally {
    second.db.close();
  }
});
