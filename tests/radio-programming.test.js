import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { DatabaseSync } from "node:sqlite";
import { installRadioChannels } from "../server/radioChannels.js";
import { installRepeaters, normalizeRepeaters } from "../server/repeaters.js";
import {
  directoryTone,
  radioChannelFromRepeater,
  canExportChannel,
  chirpCsv,
} from "../shared/radioProgramming.js";

import { manualChannel, parseChannelCsv } from "../shared/channelEntry.js";

const raw = {
  id: 72,
  callsign: "VE3RAD",
  city: "Toronto",
  latitude: 43.6,
  longitude: -79.3,
  frequency: 146940000,
  offset: -600000,
  mode: "FM",
  encode: "100.0",
  decode: "88.5",
  operational: 1,
  restriction: "",
};

test("directory tones distinguish supported CTCSS from DCS/digital and CSV never invents missing tones", () => {
  assert.equal(directoryTone("100").ctcss, "100.0");
  assert.equal(directoryTone("CC1").ctcss, null);
  assert.match(directoryTone("CC1").label, /DMR color code/);
  assert.equal(directoryTone("DCS023").ctcss, null);
  assert.equal(directoryTone("0").ctcss, null);
  const snapshot = radioChannelFromRepeater(normalizeRepeaters([raw])[0]);
  const channel = {
    snapshot,
    offsetMHz: -0.6,
    toneMode: "tone",
    txTone: "100.0",
    verified: true,
  };
  assert.equal(canExportChannel(channel), true);
  assert.equal(
    chirpCsv([channel])
      .split("\r\n")[1]
      .includes('"-","0.60000","Tone","100.0"'),
    true,
  );
  assert.equal(canExportChannel({ ...channel, toneMode: "unknown" }), false);
  assert.equal(
    canExportChannel({ ...channel, snapshot: { ...snapshot, mode: "DMR" } }),
    false,
  );
  assert.equal(
    canExportChannel({
      ...channel,
      snapshot: { ...snapshot, restriction: "CLOSED" },
    }),
    false,
  );
  assert.throws(() => chirpCsv([{ ...channel, verified: false }]));
});

test("manual form and CSV capture validate exact frequencies, quoted notes and receive-only settings", () => {
  const rows = parseChannelCsv(
    'Name,RX MHz,TX MHz,Tone,Mode,Notes\nVE3RAD,146.94,146.34,100.0,FM,"Owner, listing"\nRXTEST,162.55,off,none,NFM,Listen only',
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].notes, "Owner, listing");
  assert.equal(manualChannel(rows[0]).offsetMHz, -0.6);
  assert.equal(manualChannel(rows[1]).snapshot.receiveOnly, true);
  assert.throws(() => parseChannelCsv("BAD,999,999,none,FM"), /Row 1/);
  assert.throws(
    () => parseChannelCsv('NAME,146.52,146.52,none,FM,"unclosed'),
    /unclosed/,
  );
  assert.throws(() =>
    manualChannel({ name: "TOOLONGNAME", rxMHz: 146.52, txMHz: 146.52 }),
  );
  assert.throws(() =>
    manualChannel({ name: "TEST", rxMHz: 146.520001, txMHz: 146.52 }),
  );
});

test("radio programming list is owner-private, requires a cached repeater and verification before CSV export", async () => {
  const app = express(),
    db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY)");
  db.prepare("INSERT INTO users VALUES(1),(2)").run();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = req.header("X-Test-Owner")
      ? { id: Number(req.header("X-Test-Owner")) }
      : null;
    next();
  });
  installRepeaters(app, db, { isOffline: () => true });
  installRadioChannels(app, db);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const root = `http://127.0.0.1:${server.address().port}/api/radio-channels`;
  const request = async (path = "", method = "GET", body, owner = 1) => {
    const response = await fetch(root + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(owner ? { "X-Test-Owner": String(owner) } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    assert.equal((await request("", "GET", null, null)).status, 401);
    assert.equal(
      (await request("", "POST", { repeaterId: "hearham-72" })).status,
      404,
    );
    db.prepare("INSERT INTO repeater_cache VALUES(1,?,?)").run(
      JSON.stringify({ repeaters: normalizeRepeaters([raw]) }),
      Date.now(),
    );
    const added = await request("", "POST", { repeaterId: "hearham-72" });
    assert.equal(added.status, 201);
    assert.equal(added.data.verified, false);
    assert.equal(
      added.data.snapshot.directoryEncode,
      "100.0 Hz CTCSS (directory report; verify)",
    );
    assert.equal(added.data.toneMode, "unknown");
    assert.equal(
      (await request("", "POST", { repeaterId: "hearham-72" })).data.id,
      added.data.id,
    );
    assert.equal((await request()).data.length, 1);
    assert.deepEqual((await request("", "GET", null, 2)).data, []);
    assert.equal(
      (await request(`/${added.data.id}`, "PATCH", { verified: true })).status,
      400,
    );
    assert.equal(
      (
        await request(`/${added.data.id}`, "PATCH", {
          toneMode: "tone",
          txTone: "100.0",
        })
      ).status,
      200,
    );
    assert.equal(
      (await request(`/${added.data.id}`, "PATCH", { verified: true })).status,
      200,
    );
    const verified = (await request()).data[0];
    assert.equal(canExportChannel(verified), true);
    assert.match(chirpCsv([verified]), /VE3RAD/);
    const unknown = await request(`/${added.data.id}`, "PATCH", {
      toneMode: "unknown",
    });
    assert.equal(unknown.data.verified, false);
    assert.equal(
      (await request(`/${added.data.id}`, "PATCH", { verified: true })).status,
      400,
    );
    assert.equal(
      (
        await request(`/${added.data.id}`, "PATCH", {
          toneMode: "tone",
          txTone: "888.8",
        })
      ).status,
      400,
    );
    assert.equal(
      (await request(`/${added.data.id}`, "DELETE", null, 2)).status,
      404,
    );
    assert.equal((await request(`/${added.data.id}`, "DELETE")).status, 200);
    assert.equal((await request()).data.length, 0);
    const manual = {
      name: "RXTEST",
      rxMHz: 162.55,
      receiveOnly: true,
      tone: "none",
      mode: "NFM",
      notes: "Operator input",
    };
    assert.equal(
      (await request("/manual", "POST", { channels: [manual] }, null)).status,
      401,
    );
    const captured = await request("/manual", "POST", { channels: [manual] });
    assert.equal(captured.status, 201);
    assert.equal(captured.data[0].verified, false);
    assert.equal(captured.data[0].snapshot.receiveOnly, true);
    assert.deepEqual((await request("", "GET", null, 2)).data, []);
    const manualId = captured.data[0].id;
    assert.equal(
      (await request(`/${manualId}`, "PATCH", { verified: true })).status,
      200,
    );
    const edited = await request(`/${manualId}`, "PATCH", {
      entry: { ...manual, name: "NEWNAME" },
    });
    assert.equal(edited.data.verified, false);
    assert.equal(edited.data.snapshot.callsign, "NEWNAME");
    assert.equal(
      (await request(`/${manualId}`, "PATCH", { entry: manual }, 2)).status,
      404,
    );
    assert.equal(
      (
        await request("/manual", "POST", {
          channels: [manual, { ...manual, rxMHz: 999 }],
        })
      ).status,
      400,
    );
    assert.equal(
      (await request()).data.length,
      1,
      "invalid bulk request must save no rows",
    );
    assert.equal(
      (await request(`/${manualId}`, "PATCH", { offsetMHz: 1, verified: true }))
        .status,
      400,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
