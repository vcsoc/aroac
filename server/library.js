import { addOwnership, ownerId, visible } from "./privacy.js";
import { validGrid } from "../shared/registration.js";
const text = (v, max, label) => {
  if (typeof v !== "string" || v.length > max)
    throw Error(`Invalid ${label} (maximum ${max} characters).`);
  return v.trim();
};
function contact(v) {
  if (!v || typeof v !== "object") throw Error("Invalid contact.");
  const p = {
    name: text(v.name || "", 120, "name"),
    callsign: text(v.callsign || "", 32, "callsign").toUpperCase(),
    email: text(v.email || "", 254, "email"),
    grid: text(v.grid || "", 6, "grid").toUpperCase(),
    notes: text(v.notes || "", 2000, "notes"),
  };
  if (!p.name && !p.callsign)
    throw Error("A contact needs a name or callsign.");
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))
    throw Error("Invalid contact email.");
  if (p.grid && !validGrid(p.grid)) throw Error("Invalid contact grid.");
  return p;
}
function pin(v) {
  const p = {
    label: text(v.label, 120, "pin name"),
    name: text(v.name ?? "", 120, "contact name"),
    callsign: text(v.callsign || "", 32, "callsign").toUpperCase(),
    lat: v.lat,
    lng: v.lng,
    notes: text(v.notes || "", 2000, "notes"),
  };
  if (
    !p.label ||
    typeof p.lat !== "number" ||
    typeof p.lng !== "number" ||
    !Number.isFinite(p.lat) ||
    !Number.isFinite(p.lng) ||
    Math.abs(p.lat) > 90 ||
    Math.abs(p.lng) > 180
  )
    throw Error("Invalid saved location.");
  return p;
}
function qso(v) {
  const p = {
    callsign: text(v.callsign, 32, "callsign").toUpperCase(),
    frequency: v.frequency,
    mode: text(v.mode, 16, "mode"),
    notes: text(v.notes || "", 2000, "notes"),
    created: v.created,
  };
  if (
    !p.callsign ||
    !p.mode ||
    typeof p.frequency !== "number" ||
    !Number.isFinite(p.frequency) ||
    p.frequency <= 0 ||
    p.frequency > 300000 ||
    typeof p.created !== "string" ||
    !Number.isFinite(Date.parse(p.created))
  )
    throw Error("Invalid logbook contact.");
  p.created = new Date(p.created).toISOString();
  return p;
}
export function validateLibrary(data) {
  if (data?.format !== "oar-location-book" || data.version !== 1)
    throw Error("Not an OAR location book (version 1).");
  const output = {};
  for (const [key, validate] of [
    ["pins", pin],
    ["contacts", contact],
    ["qsos", qso],
  ]) {
    const rows = data[key] ?? [];
    if (!Array.isArray(rows) || rows.length > 10000)
      throw Error(`Invalid ${key} list (maximum 10,000).`);
    output[key] = rows.map(validate);
  }
  return output;
}
export function installLibrary(app, db) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS address_contacts(id INTEGER PRIMARY KEY,name TEXT NOT NULL,callsign TEXT NOT NULL,email TEXT NOT NULL,grid TEXT NOT NULL,notes TEXT NOT NULL)",
  );
  addOwnership(db, "address_contacts");
  app.get("/api/address-book", (req, res) =>
    res.json(
      db
        .prepare(
          `SELECT * FROM address_contacts WHERE ${visible} ORDER BY name,callsign`,
        )
        .all(ownerId(req)),
    ),
  );
  app.post("/api/address-book", (req, res) => {
    try {
      const p = contact(req.body),
        r = db
          .prepare(
            "INSERT INTO address_contacts(name,callsign,email,grid,notes,owner) VALUES(?,?,?,?,?,?)",
          )
          .run(p.name, p.callsign, p.email, p.grid, p.notes, ownerId(req));
      res
        .status(201)
        .json({ ...p, owner: ownerId(req), id: Number(r.lastInsertRowid) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.put("/api/address-book/:id", (req, res) => {
    try {
      const p = contact(req.body);
      const existing = db
        .prepare(`SELECT * FROM address_contacts WHERE id=? AND ${visible}`)
        .get(req.params.id, ownerId(req));
      if (!existing) return res.sendStatus(404);
      if (existing.owner == null && req.user) {
        const copy = db
          .prepare(
            "INSERT INTO address_contacts(name,callsign,email,grid,notes,owner) VALUES(?,?,?,?,?,?)",
          )
          .run(p.name, p.callsign, p.email, p.grid, p.notes, req.user.id);
        return res.json({
          ...p,
          id: Number(copy.lastInsertRowid),
          owner: req.user.id,
          copiedFromGeneral: true,
        });
      }
      if (
        !db
          .prepare(
            `UPDATE address_contacts SET name=?,callsign=?,email=?,grid=?,notes=? WHERE id=? AND ${visible}`,
          )
          .run(
            p.name,
            p.callsign,
            p.email,
            p.grid,
            p.notes,
            req.params.id,
            ownerId(req),
          ).changes
      )
        return res.sendStatus(404);
      res.json({ ...p, id: Number(req.params.id) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.delete("/api/address-book/:id", (req, res) => {
    if (
      !db
        .prepare(`DELETE FROM address_contacts WHERE id=? AND ${visible}`)
        .run(req.params.id, ownerId(req)).changes
    )
      return res.sendStatus(404);
    res.json({ ok: true });
  });
  app.get("/api/saved-search", (req, res) => {
    const q = String(req.query.q || "")
      .trim()
      .toLocaleLowerCase();
    if (q.length < 3 || q.length > 200)
      return res.json({ pins: [], contacts: [], contactPins: [] });
    const pins = db
      .prepare(`SELECT * FROM pins WHERE ${visible}`)
      .all(ownerId(req));
    const matches = (r) =>
      [r.name, r.label, r.callsign].some((v) =>
        v?.toLocaleLowerCase().includes(q),
      );
    const contacts = db
      .prepare(`SELECT * FROM address_contacts WHERE ${visible}`)
      .all(ownerId(req))
      .filter(matches)
      .slice(0, 20);
    const callsigns = new Set(
      contacts.map((c) => c.callsign.toUpperCase()).filter(Boolean),
    );
    res.json({
      pins: pins.filter(matches).slice(0, 20),
      contacts,
      contactPins: pins.filter((p) => callsigns.has(p.callsign.toUpperCase())),
    });
  });
  app.get("/api/library/export", (req, res) => {
    const contacts = db
      .prepare(
        `SELECT name,callsign,email,grid,notes FROM address_contacts WHERE ${visible}`,
      )
      .all(ownerId(req));
    if (req.user)
      contacts.push(
        ...db
          .prepare(
            "SELECT name,callsign,grid,bio AS notes FROM contacts JOIN users ON users.id=peer WHERE owner=?",
          )
          .all(req.user.id)
          .map((v) => ({ ...v, email: "" })),
      );
    res.json({
      format: "oar-location-book",
      version: 1,
      exportedAt: new Date().toISOString(),
      pins: db
        .prepare(
          `SELECT label,name,callsign,lat,lng,notes FROM pins WHERE ${visible}`,
        )
        .all(ownerId(req)),
      contacts,
      qsos: req.user
        ? db
            .prepare(
              "SELECT callsign,frequency,mode,notes,created FROM qsos WHERE owner=?",
            )
            .all(req.user.id)
        : [],
    });
  });
  app.post("/api/library/preview", (req, res) => {
    try {
      const data = validateLibrary(req.body?.data);
      res.json({
        counts: Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, v.length]),
        ),
        canImportLogbook: !!req.user,
      });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.post("/api/library/import", (req, res) => {
    let data;
    try {
      data = validateLibrary(req.body?.data);
      if (data.qsos.length && req.body.includeLogbook && !req.user)
        throw Error("Sign in before importing logbook contacts.");
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    const imported = { pins: 0, contacts: 0, qsos: 0 },
      skipped = { pins: 0, contacts: 0, qsos: 0 };
    const now = new Date().toISOString();
    try {
      db.exec("BEGIN");
      for (const [key, normalize, table] of [
        ["pins", pin, "pins"],
        ["contacts", contact, "address_contacts"],
        ["qsos", qso, "qsos"],
      ]) {
        if (key === "qsos" && (!req.body.includeLogbook || !data.qsos.length)) {
          skipped.qsos = data.qsos.length;
          continue;
        }
        const existing =
          key === "qsos"
            ? db.prepare("SELECT * FROM qsos WHERE owner=?").all(req.user.id)
            : db
                .prepare(`SELECT * FROM ${table} WHERE owner IS ?`)
                .all(ownerId(req));
        const signatures = new Set(
          existing.map((r) => JSON.stringify(normalize(r))),
        );
        for (const row of data[key]) {
          const sig = JSON.stringify(row);
          if (signatures.has(sig)) {
            skipped[key]++;
            continue;
          }
          signatures.add(sig);
          if (key === "pins")
            db.prepare(
              "INSERT INTO pins(label,callsign,lat,lng,notes,created,updated,name,owner) VALUES(?,?,?,?,?,?,?,?,?)",
            ).run(
              row.label,
              row.callsign,
              row.lat,
              row.lng,
              row.notes,
              now,
              now,
              row.name,
              ownerId(req),
            );
          else if (key === "contacts")
            db.prepare(
              "INSERT INTO address_contacts(name,callsign,email,grid,notes,owner) VALUES(?,?,?,?,?,?)",
            ).run(
              row.name,
              row.callsign,
              row.email,
              row.grid,
              row.notes,
              ownerId(req),
            );
          else
            db.prepare(
              "INSERT INTO qsos(owner,callsign,frequency,mode,notes,created) VALUES(?,?,?,?,?,?)",
            ).run(
              req.user.id,
              row.callsign,
              row.frequency,
              row.mode,
              row.notes,
              row.created,
            );
          imported[key]++;
        }
      }
      db.exec("COMMIT");
      res.json({ imported, skipped });
    } catch (e) {
      db.exec("ROLLBACK");
      res.status(400).json({ error: "Nothing imported: " + e.message });
    }
  });
}
