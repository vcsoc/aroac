import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";

test("accounts, session security, contacts, message isolation, logbook and validation", async () => {
  const { app, db } = createApp({ dbPath: ":memory:" });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const root = `http://127.0.0.1:${server.address().port}/api`;
  async function request(path, { method = "GET", body, cookie, origin } = {}) {
    const res = await fetch(root + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
        ...(origin ? { origin } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: res.status,
      data: await res.json(),
      cookie: res.headers.get("set-cookie")?.split(";")[0],
      rawCookie: res.headers.get("set-cookie"),
    };
  }
  const account = (callsign) => ({
    callsign,
    name: "Test operator",
    email: callsign + "@example.com",
    password: "a-long-test-password",
    grid: "FN03ck",
  });
  try {
    assert.equal((await request("/messages/1")).status, 401);
    assert.equal(
      (await request("/register", { method: "POST", body: account("invalid") }))
        .status,
      400,
    );
    const a = await request("/register", {
      method: "POST",
      body: account("ZS1ABC"),
    });
    assert.equal(a.status, 201);
    assert.match(a.rawCookie, /HttpOnly/);
    assert.equal(a.data.password, undefined);
    assert.equal(
      (await request("/register", { method: "POST", body: account("zs1abc") }))
        .status,
      409,
    );
    const b = await request("/register", {
      method: "POST",
      body: account("W1XYZ"),
    });
    const c = await request("/register", {
      method: "POST",
      body: account("G4ABC"),
    });
    assert.equal(
      (await request("/me", { cookie: a.cookie })).data.callsign,
      "ZS1ABC",
    );
    assert.equal(
      (
        await request("/login", {
          method: "POST",
          body: { callsign: "ZS1ABC", password: "wrong" },
        })
      ).status,
      401,
    );
    const login = await request("/login", {
      method: "POST",
      body: account("zs1abc"),
    });
    assert.equal(login.status, 200);
    assert.equal(
      (await request("/operators?q=w1", { cookie: a.cookie })).data[0].callsign,
      "W1XYZ",
    );
    assert.equal(
      (
        await request("/contacts/" + b.data.id, {
          method: "POST",
          body: {},
          cookie: a.cookie,
        })
      ).status,
      200,
    );
    const message = await request("/messages/" + b.data.id, {
      method: "POST",
      cookie: a.cookie,
      body: { body: "CQ from A — 73!" },
    });
    assert.equal(message.status, 201);
    assert.equal(
      (await request("/messages/" + a.data.id, { cookie: b.cookie })).data[0]
        .body,
      "CQ from A — 73!",
    );
    assert.equal(
      (await request("/messages/" + a.data.id, { cookie: c.cookie })).data
        .length,
      0,
    );
    assert.equal(
      (await request("/messages/" + b.data.id, { cookie: c.cookie })).data
        .length,
      0,
    );
    assert.equal(
      (await request("/contacts", { cookie: b.cookie })).data[0].callsign,
      "ZS1ABC",
    );
    assert.equal(
      (
        await request("/messages/" + b.data.id, {
          method: "POST",
          cookie: a.cookie,
          body: { body: " " },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/messages/" + b.data.id, {
          method: "POST",
          cookie: a.cookie,
          body: { body: "no" },
          origin: "https://evil.example",
        })
      ).status,
      403,
    );
    const qso = await request("/logbook", {
      method: "POST",
      cookie: a.cookie,
      body: {
        callsign: "W1XYZ",
        frequency: 14.074,
        mode: "FT8",
        notes: "73",
        created: "2026-09-17T12:00:00Z",
      },
    });
    assert.equal(qso.status, 201);
    assert.equal(
      (await request("/logbook", { cookie: b.cookie })).data.length,
      0,
    );
    await request("/logbook/" + qso.data.id, {
      method: "DELETE",
      cookie: b.cookie,
    });
    assert.equal(
      (await request("/logbook", { cookie: a.cookie })).data.length,
      1,
    );
    await request("/logbook/" + qso.data.id, {
      method: "DELETE",
      cookie: a.cookie,
    });
    assert.equal(
      (await request("/logbook", { cookie: a.cookie })).data.length,
      0,
    );
    assert.equal(
      (
        await request("/me", {
          method: "PATCH",
          cookie: a.cookie,
          body: { name: "Updated", grid: "JF96", bio: "Portable station" },
        })
      ).data.grid,
      "JF96",
    );
    await request("/logout", { method: "POST", cookie: a.cookie, body: {} });
    assert.equal(
      (await request("/messages/1", { cookie: a.cookie })).status,
      401,
    );
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
  }
});
