import { imageDimensions } from "../shared/media.js";
import { validateContacts } from "../shared/profile.js";
const limits = {
  name: 120,
  manufacturer: 120,
  model: 120,
  serial: 160,
  purchaseDate: 10,
  price: 40,
  currency: 12,
  supplier: 160,
  supplierEmail: 254,
  supplierPhone: 50,
  supplierAddress: 500,
  warrantyUntil: 10,
  notes: 4000,
};
function fields(body, schema) {
  const out = {};
  for (const [key, max] of Object.entries(schema)) {
    const v = body?.[key] ?? "";
    if (typeof v !== "string" || v.length > max)
      throw Error(`Invalid ${key} (maximum ${max} characters).`);
    out[key] = v.trim();
  }
  return out;
}
export function validateDevice(body) {
  const value = fields(body, limits);
  if (!value.name) throw Error("Device name is required.");
  for (const key of ["purchaseDate", "warrantyUntil"]) {
    const d = value[key];
    if (
      d &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(d) ||
        !Number.isFinite(Date.parse(d)) ||
        new Date(d).toISOString().slice(0, 10) !== d)
    )
      throw Error("Use a valid date for " + key);
  }
  return value;
}
export function attachment(body, max = 4 * 1024 * 1024, avatar = false) {
  if (
    !body ||
    typeof body.data !== "string" ||
    body.data.length > Math.ceil(max / 3) * 4 ||
    body.data.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(body.data)
  )
    throw Error("Invalid or oversized file.");
  const bytes = Buffer.from(body.data, "base64");
  if (bytes.toString("base64") !== body.data)
    throw Error("Invalid base64 file.");
  const mime = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "image/png"
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      ? "image/jpeg"
      : bytes.subarray(0, 5).toString() === "%PDF-"
        ? "application/pdf"
        : null;
  if (!mime || (avatar && mime === "application/pdf") || bytes.length > max)
    throw Error(
      avatar
        ? "Choose a PNG or JPEG avatar."
        : "Choose a PDF, JPEG or PNG invoice (up to 4 MiB).",
    );
  if (mime !== "application/pdf") {
    const dimensions = imageDimensions(bytes, mime);
    if (
      !dimensions ||
      !dimensions.width ||
      !dimensions.height ||
      dimensions.width * dimensions.height > 40000000
    )
      throw Error("Invalid image dimensions (maximum 40 megapixels).");
  }
  if (
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.length > 180 ||
    /[\x00-\x1f\\/]/.test(body.name)
  )
    throw Error("Invalid filename.");
  const extension =
    mime === "application/pdf"
      ? /\.pdf$/i
      : mime === "image/png"
        ? /\.png$/i
        : /\.jpe?g$/i;
  if (!extension.test(body.name))
    throw Error("File extension must match its PDF, PNG or JPEG content.");
  return { bytes, mime, name: body.name };
}
export function installAccount(
  app,
  db,
  { requireUser, authLimit, changePassword },
) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS account_details(owner INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,payload TEXT NOT NULL,avatar BLOB,avatar_type TEXT);CREATE TABLE IF NOT EXISTS devices(id INTEGER PRIMARY KEY,owner INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,payload TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL);CREATE TABLE IF NOT EXISTS invoices(id INTEGER PRIMARY KEY,device INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,name TEXT NOT NULL,mime TEXT NOT NULL,data BLOB NOT NULL);CREATE INDEX IF NOT EXISTS devices_owner ON devices(owner);",
  );
  const own = (req, id) =>
    db
      .prepare("SELECT * FROM devices WHERE id=? AND owner=?")
      .get(id, req.user.id);
  const account = (req) => {
    const row = db
      .prepare("SELECT * FROM account_details WHERE owner=?")
      .get(req.user.id);
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
    return {
      ...(row ? JSON.parse(row.payload) : {}),
      name: user.name,
      email: user.email,
      grid: user.grid,
      bio: user.bio,
      avatar: row?.avatar
        ? {
            mime: row.avatar_type,
            data: Buffer.from(row.avatar).toString("base64"),
          }
        : null,
    };
  };
  const handler = (fn) => (req, res) => {
    try {
      fn(req, res);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  };
  app.get(
    "/api/account",
    requireUser,
    handler((req, res) => res.json(account(req))),
  );
  app.patch(
    "/api/account",
    requireUser,
    handler((req, res) => {
      const v = validateContacts(
        fields(req.body, {
          name: 80,
          firstName: 80,
          lastName: 80,
          mobile: 40,
          mobileCountry: 2,
          email: 254,
          address: 500,
          grid: 6,
          bio: 500,
        }),
      );
      if (!v.name || (v.grid && !/^[A-R]{2}\d{2}([A-X]{2})?$/i.test(v.grid)))
        throw Error("Check your display name, email and optional grid.");
      db.exec("BEGIN");
      try {
        db.prepare(
          "UPDATE users SET name=?,email=?,grid=?,bio=? WHERE id=?",
        ).run(v.name, v.email, v.grid.toUpperCase(), v.bio, req.user.id);
        db.prepare(
          "INSERT INTO account_details(owner,payload) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET payload=excluded.payload",
        ).run(req.user.id, JSON.stringify(v));
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      res.json(account(req));
    }),
  );
  app.put(
    "/api/account/avatar",
    requireUser,
    handler((req, res) => {
      const f = attachment(req.body, 1024 * 1024, true);
      db.prepare(
        "INSERT INTO account_details(owner,payload,avatar,avatar_type) VALUES(?,'{}',?,?) ON CONFLICT(owner) DO UPDATE SET avatar=excluded.avatar,avatar_type=excluded.avatar_type",
      ).run(req.user.id, f.bytes, f.mime);
      res.json({ ok: true });
    }),
  );
  app.delete(
    "/api/account/avatar",
    requireUser,
    handler((req, res) => {
      db.prepare(
        "UPDATE account_details SET avatar=NULL,avatar_type=NULL WHERE owner=?",
      ).run(req.user.id);
      res.json({ ok: true });
    }),
  );
  app.post("/api/account/password", requireUser, authLimit, changePassword);
  app.get(
    "/api/devices",
    requireUser,
    handler((req, res) =>
      res.json(
        db
          .prepare("SELECT * FROM devices WHERE owner=? ORDER BY id DESC")
          .all(req.user.id)
          .map((r) => ({
            id: r.id,
            ...JSON.parse(r.payload),
            created: r.created,
            updated: r.updated,
            invoices: db
              .prepare(
                "SELECT id,name,mime,length(data) AS size FROM invoices WHERE device=? ORDER BY id",
              )
              .all(r.id),
          })),
      ),
    ),
  );
  app.post(
    "/api/devices",
    requireUser,
    handler((req, res) => {
      const v = validateDevice(req.body),
        now = new Date().toISOString();
      if (
        db
          .prepare("SELECT count(*) AS n FROM devices WHERE owner=?")
          .get(req.user.id).n >= 500
      )
        throw Error("Device limit is 500.");
      const r = db
        .prepare(
          "INSERT INTO devices(owner,payload,created,updated) VALUES(?,?,?,?)",
        )
        .run(req.user.id, JSON.stringify(v), now, now);
      res.status(201).json({ id: Number(r.lastInsertRowid), ...v });
    }),
  );
  app.put(
    "/api/devices/:id",
    requireUser,
    handler((req, res) => {
      if (!own(req, req.params.id))
        return res.status(404).json({ error: "Device not found." });
      const v = validateDevice(req.body);
      db.prepare(
        "UPDATE devices SET payload=?,updated=? WHERE id=? AND owner=?",
      ).run(
        JSON.stringify(v),
        new Date().toISOString(),
        req.params.id,
        req.user.id,
      );
      res.json({ ok: true });
    }),
  );
  app.delete(
    "/api/devices/:id",
    requireUser,
    handler((req, res) => {
      if (
        !db
          .prepare("DELETE FROM devices WHERE id=? AND owner=?")
          .run(req.params.id, req.user.id).changes
      )
        return res.status(404).json({ error: "Device not found." });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/devices/:id/invoices",
    requireUser,
    handler((req, res) => {
      if (!own(req, req.params.id))
        return res.status(404).json({ error: "Device not found." });
      if (
        db
          .prepare("SELECT count(*) AS n FROM invoices WHERE device=?")
          .get(req.params.id).n >= 8
      )
        throw Error("Up to eight invoices per device.");
      const f = attachment(req.body);
      const r = db
        .prepare("INSERT INTO invoices(device,name,mime,data) VALUES(?,?,?,?)")
        .run(req.params.id, f.name, f.mime, f.bytes);
      res
        .status(201)
        .json({ id: Number(r.lastInsertRowid), name: f.name, mime: f.mime });
    }),
  );
  app.get(
    "/api/devices/:id/invoices/:file",
    requireUser,
    handler((req, res) => {
      if (!own(req, req.params.id))
        return res.status(404).json({ error: "Device not found." });
      const f = db
        .prepare("SELECT * FROM invoices WHERE id=? AND device=?")
        .get(req.params.file, req.params.id);
      if (!f) return res.status(404).json({ error: "Invoice not found." });
      res.json({
        name: f.name,
        mime: f.mime,
        data: Buffer.from(f.data).toString("base64"),
      });
    }),
  );
  app.delete(
    "/api/devices/:id/invoices/:file",
    requireUser,
    handler((req, res) => {
      if (!own(req, req.params.id))
        return res.status(404).json({ error: "Device not found." });
      if (
        !db
          .prepare("DELETE FROM invoices WHERE id=? AND device=?")
          .run(req.params.file, req.params.id).changes
      )
        return res.status(404).json({ error: "Invoice not found." });
      res.json({ ok: true });
    }),
  );
}
