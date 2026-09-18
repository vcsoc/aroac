import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../server/app.js";
import { attachment, validateDevice } from "../server/account.js";
import { alphabeticalGroup, horizonKm } from "../src/contactContext.js";
import { validatePlace } from "../shared/workspace.js";
test("alphabetical buckets, horizon assumptions and clock color validation", () => {
  assert.equal(alphabeticalGroup("Émile"), "E");
  assert.equal(alphabeticalGroup("9H1ABC"), "0–9");
  assert.equal(alphabeticalGroup("🙂"), "#");
  assert.ok(Math.abs(horizonKm(10, 10) - 22.58) < 0.1);
  assert.ok(horizonKm(10, 10, 4 / 3) > horizonKm(10, 10));
  assert.equal(
    validatePlace({ name: "Test", zone: "UTC", color: "#abcdef" }).color,
    "#abcdef",
  );
  assert.throws(() =>
    validatePlace({ name: "Test", zone: "UTC", color: ["#ffffff"] }),
  );
  assert.throws(() =>
    validateDevice({ name: "Rig", purchaseDate: "2025-02-29" }),
  );
  assert.throws(() =>
    attachment({
      name: "bad.svg",
      data: Buffer.from("<svg/>").toString("base64"),
    }),
  );
  const large = Buffer.alloc(4 * 1024 * 1024);
  large.write("%PDF-1.7");
  assert.equal(
    attachment({ name: "large.pdf", data: large.toString("base64") }).bytes
      .length,
    large.length,
  );
});
test("private profiles/devices/invoices are owner-scoped, password changes require current password and revoke other sessions", async () => {
  const { app, db } = createApp({ dbPath: ":memory:" });
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
    return { status: r.status, data: await r.json() };
  };
  try {
    const register = async (call) =>
      (
        await request("/register", null, "POST", {
          callsign: call,
          name: "Owner",
          email: "owner@example.test",
          password: "original-password-123",
        })
      ).data.token;
    const a = await register("N1OWN"),
      b = await register("N2OTHER");
    assert.equal((await request("/account")).status, 401);
    assert.equal((await request("/devices")).status, 401);
    const changed = await request("/account", a, "PATCH", {
      name: "Station Owner",
      firstName: "First",
      lastName: "Last",
      mobile: "+15551234567",
      email: "private@example.test",
      grid: "FN03",
      bio: "Test",
      address: "Private address",
    });
    assert.equal(changed.data.firstName, "First");
    assert.equal((await request("/account", b)).data.firstName, undefined);
    assert.equal((await request("/me", a)).data.mobile, undefined);
    const image = readFileSync("public/icon-512.png").toString("base64");
    assert.equal(
      (
        await request("/account/avatar", a, "PUT", {
          name: "avatar.png",
          data: image,
        })
      ).status,
      200,
    );
    assert.equal((await request("/account", a)).data.avatar.data, image);
    assert.equal((await request("/account", b)).data.avatar, null);
    const device = (
      await request("/devices", a, "POST", {
        name: "My rig",
        serial: "PRIVATE-SERIAL",
        purchaseDate: "2026-01-01",
        supplier: "Radio shop",
        notes: "Owned gear",
      })
    ).data;
    assert.equal((await request("/devices", b)).data.length, 0);
    assert.equal(
      (
        await request("/devices/" + device.id, b, "PUT", {
          name: "Stolen edit",
        })
      ).status,
      404,
    );
    const invoice = (
      await request(`/devices/${device.id}/invoices`, a, "POST", {
        name: "invoice.png",
        data: image,
      })
    ).data;
    assert.equal(
      (await request(`/devices/${device.id}/invoices/${invoice.id}`, b)).status,
      404,
    );
    assert.equal(
      (await request(`/devices/${device.id}/invoices/${invoice.id}`, a)).data
        .data,
      image,
    );
    assert.equal(
      (await request("/devices/" + device.id, b, "DELETE")).status,
      404,
    );
    assert.equal((await request("/library/export", a)).data.devices, undefined);
    const second = (
      await request("/login", null, "POST", {
        callsign: "N1OWN",
        password: "original-password-123",
      })
    ).data.token;
    assert.equal(
      (
        await request("/account/password", a, "POST", {
          currentPassword: "incorrect",
          newPassword: "replacement-password-123",
          confirmPassword: "replacement-password-123",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request("/account/password", a, "POST", {
          currentPassword: "original-password-123",
          newPassword: "replacement-password-123",
          confirmPassword: "replacement-password-123",
        })
      ).status,
      200,
    );
    assert.equal((await request("/me", second)).data, null);
    assert.equal((await request("/me", a)).data.callsign, "N1OWN");
    assert.equal(
      (
        await request("/login", null, "POST", {
          callsign: "N1OWN",
          password: "original-password-123",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request("/login", null, "POST", {
          callsign: "N1OWN",
          password: "replacement-password-123",
        })
      ).status,
      200,
    );
    assert.notEqual(
      db.prepare("SELECT password FROM users WHERE callsign=?").get("N1OWN")
        .password,
      "replacement-password-123",
    );
    await request("/devices/" + device.id, a, "DELETE");
    assert.equal(db.prepare("SELECT count(*) AS n FROM invoices").get().n, 0);
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
  }
});
