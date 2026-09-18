import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
test("registration does not require a grid, invalid supplied grids fail, and a saved grid can be cleared", async () => {
  const { app, db } = createApp({ dbPath: ":memory:" });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let token;
  async function send(route, body, method = "POST") {
    return fetch(base + route, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-OAR-Client": "native",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: JSON.stringify(body),
    });
  }
  try {
    const res = await send("/register", {
      callsign: "N1GRID",
      name: "No grid",
      email: "grid@example.com",
      password: "grid-optional-password",
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    token = data.token;
    assert.equal(data.user.grid, "");
    assert.equal(
      (await send("/me", { name: "No grid", grid: "wrong" }, "PATCH")).status,
      400,
    );
    assert.equal(
      (
        await (
          await send("/me", { name: "No grid", grid: "FN03" }, "PATCH")
        ).json()
      ).grid,
      "FN03",
    );
    assert.equal(
      (await (await send("/me", { name: "No grid", grid: "" }, "PATCH")).json())
        .grid,
      "",
    );
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
  }
});
