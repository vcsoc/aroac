import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { defaultTimeConfig } from "../shared/workspace.js";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

test("General remains visible while profile records, search, exports, corrections and home settings are owner-scoped", async () => {
  const { app, db } = createApp({ dbPath: ":memory:", isOffline: () => true });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const root = "http://127.0.0.1:" + server.address().port + "/api";
  const request = async (route, token, method = "GET", body) => {
    const r = await fetch(root + route, {
      method,
      headers: {
        "content-type": "application/json",
        "x-oar-client": "native",
        ...(token ? { authorization: "Bearer " + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    return {
      status: r.status,
      data: (() => {
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      })(),
    };
  };
  try {
    const gp = (
      await request("/pins", null, "POST", {
        label: "General place",
        lat: 1,
        lng: 2,
      })
    ).data;
    await request("/address-book", null, "POST", { name: "General contact" });
    const register = async (callsign) =>
      (
        await request("/register", null, "POST", {
          callsign,
          name: "Tester",
          email: "test@example.com",
          password: "privacy-password-123",
        })
      ).data;
    const a = await register("N1SECRET"),
      b = await register("N2SECRET");
    const ap = (
      await request("/pins", a.token, "POST", {
        label: "Secret Alpha",
        name: "Alpha hidden",
        callsign: "N9ALPHA",
        lat: 43,
        lng: -79,
        owner: null,
      })
    ).data;
    const ac = (
      await request("/address-book", a.token, "POST", {
        name: "Secret Alpha contact",
        callsign: "N9ALPHA",
        owner: null,
      })
    ).data;
    const bp = (
      await request("/pins", b.token, "POST", {
        label: "Secret Beta",
        lat: 4,
        lng: 5,
      })
    ).data;
    assert.equal(ap.owner, a.user.id);
    assert.equal(ac.owner, a.user.id);
    assert.equal(gp.owner, null);
    assert.deepEqual(
      (await request("/pins")).data.map((p) => p.id),
      [gp.id],
    );
    assert.deepEqual(
      (await request("/pins", a.token)).data.map((p) => p.id).sort(),
      [gp.id, ap.id].sort(),
    );
    assert.equal(
      (await request("/pins/" + ap.id, b.token, "PATCH", { label: "Stolen" }))
        .status,
      404,
    );
    assert.equal((await request("/pins/" + ap.id, null, "DELETE")).status, 404);
    assert.equal(
      (
        await request("/address-book/" + ac.id, b.token, "PUT", {
          name: "Stolen",
        })
      ).status,
      404,
    );
    assert.equal(
      (await request("/address-book/" + ac.id, null, "DELETE")).status,
      404,
    );
    for (const token of [null, b.token]) {
      const search = (await request("/saved-search?q=Alpha", token)).data;
      assert.deepEqual(search, { pins: [], contacts: [], contactPins: [] });
      assert.ok(
        !JSON.stringify(
          (await request("/library/export", token)).data,
        ).includes("Alpha"),
      );
    }
    const editedGeneral = (
      await request("/pins/" + gp.id, a.token, "PATCH", {
        label: "Sensitive shared edit",
      })
    ).data;
    assert.notEqual(editedGeneral.id, gp.id);
    assert.equal(editedGeneral.owner, a.user.id);
    assert.equal((await request("/pins")).data[0].label, "General place");
    const generalContact = (await request("/address-book")).data[0];
    const editedContact = (
      await request("/address-book/" + generalContact.id, a.token, "PUT", {
        name: "Sensitive contact edit",
      })
    ).data;
    assert.equal(editedContact.owner, a.user.id);
    assert.notEqual(editedContact.id, generalContact.id);
    assert.equal(
      (await request("/address-book")).data[0].name,
      "General contact",
    );
    const exported = (await request("/library/export", a.token)).data;
    assert.ok(JSON.stringify(exported).includes("Alpha"));
    assert.ok(!JSON.stringify(exported).includes("Beta"));
    const importData = {
      format: "oar-location-book",
      version: 1,
      pins: [{ label: "Imported private", lat: 3, lng: 4 }],
      contacts: [{ name: "Imported private contact" }],
    };
    assert.equal(
      (await request("/library/import", a.token, "POST", { data: importData }))
        .status,
      200,
    );
    assert.ok(
      !JSON.stringify((await request("/library/export")).data).includes(
        "Imported private",
      ),
    );
    const time = {
      ...defaultTimeConfig(),
      home: {
        ...defaultTimeConfig().home,
        name: "Secret home",
        zone: "UTC",
        lat: 43,
        lng: -79,
      },
    };
    assert.equal(
      (await request("/preferences/world-time", a.token, "PUT", time)).status,
      200,
    );
    assert.equal((await request("/preferences/world-time")).data.value, null);
    assert.equal(
      (await request("/preferences/world-time", b.token)).data.value,
      null,
    );
    db.prepare("INSERT INTO geocode_cache VALUES(?,?,?)").run(
      "example address",
      JSON.stringify([
        { id: "provider", title: "Example address", lat: 10, lng: 11 },
      ]),
      Date.now(),
    );
    assert.equal(
      (
        await request("/geocode/correction", b.token, "POST", {
          query: "Example address",
          pinId: ap.id,
          resultId: "provider",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request("/geocode/correction", a.token, "POST", {
          query: "Example address",
          pinId: ap.id,
          resultId: "provider",
        })
      ).status,
      200,
    );
    assert.equal(
      (await request("/geocode?q=example%20address", a.token)).data.results[0]
        .lat,
      43,
    );
    assert.equal(
      (await request("/geocode?q=example%20address")).data.results[0].lat,
      10,
    );
    await request("/logout", a.token, "POST", {});
    assert.deepEqual(
      (await request("/pins", a.token)).data.map((p) => p.id),
      [gp.id],
    );
    assert.equal((await request("/account", a.token)).status, 401);
    assert.equal(
      (
        await request("/pins", a.token, "POST", {
          label: "Must not become General",
          lat: 1,
          lng: 1,
        })
      ).status,
      401,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    db.close();
  }
});

for (const profiles of [1, 2])
  test(`legacy ownership migration preserves records privately with ${profiles} existing profiles and makes a private backup`, () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "oar-privacy-migrate-")),
      file = path.join(dir, "station.sqlite");
    let db;
    try {
      ({ db } = createApp({ dbPath: file }));
      for (let i = 1; i <= profiles; i++)
        db.prepare(
          "INSERT INTO users(callsign,name,email,password,grid) VALUES(?,?,?,?,?)",
        ).run("N" + i + "OLD", "Old", "old@example.com", "legacy", "");
      db.exec(
        "DROP INDEX pins_owner; ALTER TABLE pins DROP COLUMN owner; INSERT INTO pins(label,callsign,lat,lng,notes,created,updated,name) VALUES('Legacy secret','',1,2,'','old','old',''); DROP INDEX address_contacts_owner; ALTER TABLE address_contacts DROP COLUMN owner; INSERT INTO address_contacts(name,callsign,email,grid,notes) VALUES('Legacy contact','','','',''); DROP TABLE private_preferences;",
      );
      db.close();
      ({ db } = createApp({ dbPath: file }));
      assert.equal(
        db.prepare("SELECT owner FROM pins").get().owner,
        profiles === 1 ? 1 : -1,
      );
      assert.equal(
        db.prepare("SELECT owner FROM address_contacts").get().owner,
        profiles === 1 ? 1 : -1,
      );
      const backup = path.join(
        dir,
        "backups",
        readdirSync(path.join(dir, "backups"))[0],
      );
      assert.equal(statSync(backup).mode & 0o777, 0o600);
      const old = new DatabaseSync(backup, { readOnly: true });
      assert.equal(
        old.prepare("SELECT label FROM pins").get().label,
        "Legacy secret",
      );
      old.close();
    } finally {
      db?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
