export function installPins(app, db) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS pins(id INTEGER PRIMARY KEY,label TEXT NOT NULL,callsign TEXT NOT NULL DEFAULT '',lat REAL NOT NULL,lng REAL NOT NULL,notes TEXT NOT NULL DEFAULT '',created TEXT NOT NULL,updated TEXT NOT NULL)`,
  );
  if (
    !db
      .prepare("PRAGMA table_info(pins)")
      .all()
      .some((c) => c.name === "name")
  )
    db.exec("ALTER TABLE pins ADD COLUMN name TEXT NOT NULL DEFAULT ''");
  const get = (id) => db.prepare("SELECT * FROM pins WHERE id=?").get(id);
  const validate = (data, existing = {}) => {
    const result = { ...existing },
      fields = {};
    for (const [key, max] of [
      ["label", 120],
      ["name", 120],
      ["callsign", 32],
      ["notes", 2000],
    ]) {
      const value = data[key] === undefined ? (existing[key] ?? "") : data[key];
      if (
        typeof value !== "string" ||
        value.length > max ||
        (key === "label" && !value.trim())
      )
        fields[key] =
          `${key === "label" ? "Location name" : key} must ${key === "label" ? "contain 1–" : "contain no more than "}${max} characters.`;
      else
        result[key] =
          key === "callsign" ? value.trim().toUpperCase() : value.trim();
    }
    for (const [key, max] of [
      ["lat", 90],
      ["lng", 180],
    ]) {
      const value = data[key] === undefined ? existing[key] : data[key];
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        Math.abs(value) > max
      )
        fields[key] =
          `${key === "lat" ? "Latitude" : "Longitude"} must be between -${max} and ${max}.`;
      else result[key] = value;
    }
    return { result, fields };
  };
  app.get("/api/pins", (_req, res) =>
    res.json(db.prepare("SELECT * FROM pins ORDER BY id DESC").all()),
  );
  app.post("/api/pins", (req, res) => {
    const { result: p, fields } = validate(req.body || {});
    if (Object.keys(fields).length)
      return res.status(400).json({ error: Object.values(fields)[0], fields });
    const now = new Date().toISOString();
    const record = db
      .prepare(
        "INSERT INTO pins(label,callsign,lat,lng,notes,created,updated,name) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(p.label, p.callsign, p.lat, p.lng, p.notes, now, now, p.name);
    res.status(201).json(get(Number(record.lastInsertRowid)));
  });
  app.patch("/api/pins/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id))
      return res.status(404).json({ error: "Saved location not found" });
    const existing = get(id);
    if (!existing)
      return res.status(404).json({ error: "Saved location not found" });
    const { result: p, fields } = validate(req.body || {}, existing);
    if (Object.keys(fields).length)
      return res.status(400).json({ error: Object.values(fields)[0], fields });
    db.prepare(
      "UPDATE pins SET label=?,callsign=?,lat=?,lng=?,notes=?,updated=?,name=? WHERE id=?",
    ).run(
      p.label,
      p.callsign,
      p.lat,
      p.lng,
      p.notes,
      new Date().toISOString(),
      p.name,
      id,
    );
    res.json(get(id));
  });
  app.delete("/api/pins/:id", (req, res) => {
    const id = Number(req.params.id);
    if (
      !Number.isSafeInteger(id) ||
      !db.prepare("DELETE FROM pins WHERE id=?").run(id).changes
    )
      return res.status(404).json({ error: "Saved location not found" });
    res.json({ ok: true, id });
  });
}
