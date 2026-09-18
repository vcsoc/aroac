import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRegistration } from "../shared/registration.js";
import { createApp } from "../server/app.js";
const valid = {
  callsign: "EA8/ZS1ABC/P",
  name: "Operator",
  email: "operator@example.com",
  password: "  long password  ",
  grid: "",
};
test("registration normalizes non-secret fields and preserves passwords exactly", () => {
  const { values, fields } = validateRegistration({
    ...valid,
    callsign: "  ea8/zs1abc/p  ",
    name: " Operator ",
    email: " operator@example.com ",
    grid: "  ",
  });
  assert.deepEqual(fields, {});
  assert.equal(values.callsign, "EA8/ZS1ABC/P");
  assert.equal(values.name, "Operator");
  assert.equal(values.email, "operator@example.com");
  assert.equal(values.grid, "");
  assert.equal(values.password, valid.password);
  assert.equal(
    validateRegistration({ ...valid, grid: " fn03ck " }).values.grid,
    "FN03CK",
  );
});
test("each invalid registration field has a specific error", () => {
  for (const [field, value] of Object.entries({
    callsign: "not-a-call",
    name: " ",
    email: "no-at-sign",
    password: "short",
    grid: "unknown",
  })) {
    const { fields } = validateRegistration({ ...valid, [field]: value });
    assert.deepEqual(Object.keys(fields), [field]);
    assert.ok(fields[field].length > 10);
  }
});
test("API returns field errors and accepts normalized portable callsigns without a grid", async () => {
  const { app, db } = createApp({ dbPath: ":memory:" });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const root = `http://127.0.0.1:${server.address().port}/api`;
  const send = (path, data) =>
    fetch(root + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-OAR-Client": "native" },
      body: JSON.stringify(data),
    });
  try {
    const bad = await send("/register", { ...valid, email: "invalid" });
    assert.equal(bad.status, 400);
    assert.deepEqual(Object.keys((await bad.json()).fields), ["email"]);
    const result = await send("/register", {
      ...valid,
      callsign: "  ea8/zs1abc/p ",
      grid: "   ",
    });
    assert.equal(result.status, 201);
    assert.equal((await result.json()).user.grid, "");
    assert.equal(
      (
        await send("/login", {
          callsign: valid.callsign,
          password: valid.password,
        })
      ).status,
      200,
    );
    const duplicate = await send("/register", valid);
    assert.equal(duplicate.status, 409);
    assert.ok((await duplicate.json()).fields.callsign);
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
  }
});
