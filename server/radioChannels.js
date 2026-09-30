import {
  radioChannelFromRepeater,
  canExportChannel,
  validCtcss,
} from "../shared/radioProgramming.js";

import { randomUUID } from "node:crypto";
import { manualChannel } from "../shared/channelEntry.js";

export function installRadioChannels(app, db) {
  db.exec(`CREATE TABLE IF NOT EXISTS radio_channels (
    id INTEGER PRIMARY KEY,
    owner INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    repeater_id TEXT NOT NULL,
    snapshot TEXT NOT NULL,
    offset_mhz REAL,
    tone_mode TEXT NOT NULL DEFAULT 'unknown',
    tx_tone TEXT,
    verified INTEGER NOT NULL DEFAULT 0,
    created TEXT NOT NULL,
    UNIQUE(owner, repeater_id)
  )`);
  const requireUser = (req, res, next) =>
    req.user
      ? next()
      : res.status(401).json({
          error: "Sign in to manage your private radio programming list.",
        });
  const rows = db.prepare(
    "SELECT * FROM radio_channels WHERE owner=? ORDER BY id ASC",
  );
  const one = db.prepare("SELECT * FROM radio_channels WHERE owner=? AND id=?");
  const view = (row) =>
    row && {
      id: row.id,
      repeaterId: row.repeater_id,
      snapshot: JSON.parse(row.snapshot),
      offsetMHz: row.offset_mhz,
      toneMode: row.tone_mode,
      txTone: row.tx_tone,
      verified: !!row.verified,
      created: row.created,
    };
  app.get("/api/radio-channels", requireUser, (req, res) =>
    res.json(rows.all(req.user.id).map(view)),
  );
  const insertManual = db.prepare(
    "INSERT INTO radio_channels(owner,repeater_id,snapshot,offset_mhz,tone_mode,tx_tone,created) VALUES(?,?,?,?,?,?,?)",
  );
  app.post("/api/radio-channels/manual", requireUser, (req, res) => {
    let entries;
    try {
      const input = req.body?.channels;
      if (!Array.isArray(input) || !input.length || input.length > 128)
        throw Error("Enter 1–128 channels.");
      if (rows.all(req.user.id).length + input.length > 128)
        throw Error("The programming list is limited to 128 channels.");
      entries = input.map(manualChannel);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    const ids = [];
    db.exec("BEGIN");
    try {
      for (const entry of entries) {
        const result = insertManual.run(
          req.user.id,
          `manual-${randomUUID()}`,
          JSON.stringify(entry.snapshot),
          entry.offsetMHz,
          entry.toneMode,
          entry.txTone,
          new Date().toISOString(),
        );
        ids.push(Number(result.lastInsertRowid));
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    res.status(201).json(ids.map((id) => view(one.get(req.user.id, id))));
  });
  app.post("/api/radio-channels", requireUser, (req, res) => {
    const id = req.body?.repeaterId;
    if (
      typeof id !== "string" ||
      id.length > 120 ||
      !/^hearham-[\w.-]+$/.test(id)
    )
      return res
        .status(400)
        .json({ error: "Select a directory repeater to add to your list." });
    const old = db
      .prepare("SELECT * FROM radio_channels WHERE owner=? AND repeater_id=?")
      .get(req.user.id, id);
    if (old) return res.json(view(old));
    if (rows.all(req.user.id).length >= 128)
      return res
        .status(400)
        .json({ error: "The programming list is limited to 128 channels." });
    const cached = db
      .prepare("SELECT payload FROM repeater_cache WHERE id=1")
      .get();
    let repeater;
    try {
      repeater = JSON.parse(cached?.payload || "{}").repeaters?.find(
        (r) => r.id === id,
      );
    } catch {}
    if (!repeater)
      return res.status(404).json({
        error:
          "Repeater not in the saved directory. Download the directory first.",
      });
    let snapshot;
    try {
      snapshot = radioChannelFromRepeater(repeater);
    } catch {
      return res
        .status(400)
        .json({ error: "Repeater cannot be saved as a radio channel." });
    }
    const row = db
      .prepare(
        "INSERT INTO radio_channels(owner,repeater_id,snapshot,offset_mhz,tone_mode,tx_tone,created) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        req.user.id,
        id,
        JSON.stringify(snapshot),
        snapshot.offsetMHz,
        "unknown",
        null,
        new Date().toISOString(),
      );
    res
      .status(201)
      .json(view(one.get(req.user.id, Number(row.lastInsertRowid))));
  });
  app.patch("/api/radio-channels/:id", requireUser, (req, res) => {
    const id = Number(req.params.id),
      current = Number.isSafeInteger(id) ? one.get(req.user.id, id) : null;
    if (!current)
      return res.status(404).json({ error: "Radio channel not found." });
    const body = req.body || {};
    if (Object.hasOwn(body, "entry")) {
      if (
        !current.repeater_id.startsWith("manual-") ||
        Object.keys(body).length !== 1
      )
        return res.status(400).json({
          error:
            "Only manual entries can be edited with the full channel form.",
        });
      let entry;
      try {
        entry = manualChannel(body.entry);
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }
      db.prepare(
        "UPDATE radio_channels SET snapshot=?,offset_mhz=?,tone_mode=?,tx_tone=?,verified=0 WHERE owner=? AND id=?",
      ).run(
        JSON.stringify(entry.snapshot),
        entry.offsetMHz,
        entry.toneMode,
        entry.txTone,
        req.user.id,
        id,
      );
      return res.json(view(one.get(req.user.id, id)));
    }
    if (
      Object.keys(body).some(
        (key) => !["offsetMHz", "toneMode", "txTone", "verified"].includes(key),
      )
    )
      return res
        .status(400)
        .json({ error: "Unexpected radio channel setting." });
    const offsetMHz = Object.hasOwn(body, "offsetMHz")
      ? body.offsetMHz
      : current.offset_mhz;
    const toneMode = Object.hasOwn(body, "toneMode")
      ? body.toneMode
      : current.tone_mode;
    let txTone = Object.hasOwn(body, "txTone") ? body.txTone : current.tx_tone;
    if (
      offsetMHz !== null &&
      (!Number.isFinite(offsetMHz) || Math.abs(offsetMHz) > 10)
    )
      return res.status(400).json({
        error:
          "Enter a verified signed offset between -10 and +10 MHz, or leave it unknown.",
      });
    if (!["tone", "none", "unknown"].includes(toneMode))
      return res.status(400).json({ error: "Choose a valid tone setting." });
    if (toneMode !== "tone") txTone = null;
    if (toneMode === "tone" && !validCtcss(txTone))
      return res
        .status(400)
        .json({ error: "Select a standard CTCSS transmit tone in Hz." });
    const changed =
      offsetMHz !== current.offset_mhz ||
      toneMode !== current.tone_mode ||
      txTone !== current.tx_tone;
    const verified =
      body.verified === true
        ? true
        : body.verified === false || changed
          ? false
          : !!current.verified;
    const candidate = {
      snapshot: JSON.parse(current.snapshot),
      offsetMHz,
      toneMode,
      txTone,
      verified,
    };
    if (verified && !canExportChannel(candidate))
      return res.status(400).json({
        error:
          "Only verified open analog FM channels in a supported band, with checked offset and tone, can be exported.",
      });
    db.prepare(
      "UPDATE radio_channels SET offset_mhz=?,tone_mode=?,tx_tone=?,verified=? WHERE owner=? AND id=?",
    ).run(offsetMHz, toneMode, txTone, +verified, req.user.id, id);
    res.json(view(one.get(req.user.id, id)));
  });
  app.delete("/api/radio-channels/:id", requireUser, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || !one.get(req.user.id, id))
      return res.status(404).json({ error: "Radio channel not found." });
    db.prepare("DELETE FROM radio_channels WHERE owner=? AND id=?").run(
      req.user.id,
      id,
    );
    res.json({ deleted: true });
  });
}
