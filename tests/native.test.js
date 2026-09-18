import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
test("native sessions use bearer tokens, never cookies, and are revoked on logout", async () => {
  const { app, db } = createApp({ dbPath: ":memory:" });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = async (route, { token, body, cookie } = {}) => {
    const r = await fetch(origin + "/api" + route, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        "X-OAR-Client": "native",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: r.status,
      cookie: r.headers.get("set-cookie"),
      data: await r.json(),
    };
  };
  try {
    const registered = await request("/register", {
      body: {
        callsign: "ZS1NAT",
        name: "Native Operator",
        email: "native@example.com",
        grid: "JF96",
        password: "native-test-password",
      },
    });
    assert.equal(registered.status, 201);
    assert.equal(registered.cookie, null);
    const { token, user } = registered.data;
    assert.equal(token.length, 64);
    assert.equal(user.callsign, "ZS1NAT");
    assert.equal((await request("/me", { token })).data.callsign, "ZS1NAT");
    assert.equal(
      (await request("/me", { cookie: "oar_session=" + token })).data,
      null,
    );
    assert.equal((await request("/messages/1")).status, 401);
    await request("/logout", { token, body: {} });
    assert.equal((await request("/me", { token })).data, null);
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
  }
});
