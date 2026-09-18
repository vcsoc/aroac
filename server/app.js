import express from "express";
import { installSources } from "./sources.js";
import { installGeocoding } from "./geocoding.js";
import { installCities } from "./cities.js";
import { installAccount } from "./account.js";
import { installPins } from "./pins.js";
import { installWorkspace } from "./workspace.js";
import { installWeather } from "./weather.js";
import { installLibrary } from "./library.js";
import { installRepeaters } from "./repeaters.js";
import { installMuf } from "./muf.js";
import { installMufContours } from "./mufContours.js";
import {
  validateRegistration,
  validCallsign,
  normalizeText,
} from "../shared/registration.js";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { mkdirSync, chmodSync } from "node:fs";
import path from "node:path";
const scrypt = promisify(scryptCb);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const publicUser = (u) =>
  u && {
    id: u.id,
    callsign: u.callsign,
    name: u.name,
    grid: u.grid,
    bio: u.bio,
  };
export function createApp({
  dbPath = "data/oar.sqlite",
  citiesPath,
  sourcesPath,
  defaultSourcesPath,
  sourceFetcher,
  apiRateLimit = 240,
  secure = process.env.COOKIE_SECURE === "true",
  localKey,
  isOffline = () => false,
} = {}) {
  if (dbPath !== ":memory:")
    mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dbPath);
  if (dbPath !== ":memory:")
    for (const file of [dbPath, dbPath + "-wal", dbPath + "-shm"]) {
      try {
        chmodSync(file, 0o600);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,callsign TEXT UNIQUE NOT NULL,name TEXT NOT NULL,email TEXT NOT NULL,password TEXT NOT NULL,grid TEXT NOT NULL,bio TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS contacts(owner INTEGER REFERENCES users(id),peer INTEGER REFERENCES users(id),PRIMARY KEY(owner,peer));
 CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY,sender INTEGER REFERENCES users(id),recipient INTEGER REFERENCES users(id),body TEXT NOT NULL,created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
 CREATE INDEX IF NOT EXISTS messages_pair ON messages(sender,recipient,id);
 CREATE TABLE IF NOT EXISTS qsos(id INTEGER PRIMARY KEY,owner INTEGER REFERENCES users(id),callsign TEXT NOT NULL,frequency REAL NOT NULL,mode TEXT NOT NULL,notes TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS feed_cache(name TEXT PRIMARY KEY, value TEXT NOT NULL, fetched INTEGER NOT NULL);
 `);
  const app = express();
  app.disable("x-powered-by");
  if (localKey)
    app.use((req, res, next) => {
      if (req.get("X-OAR-Local-Key") !== localKey)
        return res.status(403).json({ error: "Private application service" });
      next();
    });
  app.use(
    helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }),
  );
  app.use(
    [
      "/api/library/import",
      "/api/library/preview",
      "/api/account/avatar",
      /^\/api\/devices\/\d+\/invoices$/,
    ],
    express.json({ limit: "8mb" }),
  );
  app.use("/api/devices", express.json({ limit: "64kb" }));
  app.use("/api/sources", express.json({ limit: "256kb" }));
  app.use(express.json({ limit: "16kb" }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    // Native clients use explicit bearer sessions, never ambient browser cookies.
    req.nativeClient = req.get("X-OAR-Client") === "native";
    if (
      !req.nativeClient &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== `${req.protocol}://${req.get("host")}` &&
      req.headers.origin !== process.env.APP_ORIGIN
    )
      return res.status(403).json({ error: "Origin not allowed" });
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: apiRateLimit,
      message: {
        error: "Too many requests. Please wait a minute and try again.",
      },
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    message: {
      error:
        "Too many sign-in or registration attempts. Please wait 15 minutes and try again.",
    },
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const fail = (res, status, error) => res.status(status).json({ error });
  const cookie = (res, token, maxAge) =>
    res.cookie("oar_session", token, {
      httpOnly: true,
      secure,
      sameSite: "strict",
      path: "/",
      maxAge,
    });
  const session = (res, id, nativeClient = false) => {
    const token = randomBytes(32).toString("hex");
    db.prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      sha(token),
      id,
      nativeClient && localKey
        ? Number.MAX_SAFE_INTEGER
        : Date.now() + 30 * 86400000,
    );
    if (!nativeClient) cookie(res, token, 30 * 86400000);
    return token;
  };
  app.use("/api", (req, res, next) => {
    const bearer = req
      .get("Authorization")
      ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    const token = req.nativeClient
      ? bearer
      : req.headers.cookie
          ?.split(";")
          .map((x) => x.trim())
          .find((x) => x.startsWith("oar_session="))
          ?.slice(12);
    if (token) {
      req.token = sha(token);
      req.user = db
        .prepare(
          "SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?",
        )
        .get(req.token, Date.now());
    }
    next();
  });
  const requireUser = (req, res, next) =>
    req.user ? next() : fail(res, 401, "Sign in to continue");
  const text = (x, max) =>
    typeof x === "string" && x.trim().length > 0 && x.length <= max;
  const call = (x) => (typeof x === "string" ? x.trim().toUpperCase() : "");
  const validCall = validCallsign;
  const validGrid = (x) =>
    typeof x === "string" &&
    (x === "" || /^[A-R]{2}[0-9]{2}([A-X]{2})?$/i.test(x));
  app.post("/api/register", authLimit, async (req, res) => {
    const { values, fields } = validateRegistration(req.body || {});
    if (Object.keys(fields).length)
      return res.status(400).json({ error: Object.values(fields)[0], fields });
    const { name, email, password, grid, callsign } = values;
    const salt = randomBytes(16).toString("hex");
    const hash = (await scrypt(password, salt, 64)).toString("hex");
    try {
      const result = db
        .prepare(
          "INSERT INTO users(callsign,name,email,password,grid) VALUES(?,?,?,?,?)",
        )
        .run(
          callsign,
          name.trim(),
          email.trim(),
          `${salt}:${hash}`,
          grid.toUpperCase(),
        );
      const id = Number(result.lastInsertRowid);
      const token = session(res, id, req.nativeClient);
      const user = publicUser(
        db.prepare("SELECT * FROM users WHERE id=?").get(id),
      );
      res.status(201).json(req.nativeClient ? { user, token } : user);
    } catch (e) {
      if (e.message.includes("UNIQUE"))
        return res.status(409).json({
          error: "This callsign already has a local profile. Sign in instead.",
          fields: {
            callsign:
              "This callsign is already registered on this installation.",
          },
        });
      throw e;
    }
  });
  app.post("/api/login", authLimit, async (req, res) => {
    const u = db
      .prepare("SELECT * FROM users WHERE callsign=?")
      .get(call(req.body.callsign));
    const password = req.body.password;
    if (!text(password, 128)) return fail(res, 400, "Password required");
    const [salt, hash] = (
      u?.password || `${"0".repeat(32)}:${"0".repeat(128)}`
    ).split(":");
    const attempt = await scrypt(password, salt, 64);
    if (!u || !timingSafeEqual(attempt, Buffer.from(hash, "hex")))
      return fail(res, 401, "Incorrect callsign or password");
    const token = session(res, u.id, req.nativeClient);
    res.json(req.nativeClient ? { user: publicUser(u), token } : publicUser(u));
  });
  app.post("/api/logout", (req, res) => {
    if (req.token)
      db.prepare("DELETE FROM sessions WHERE token=?").run(req.token);
    if (!req.nativeClient) cookie(res, "", 0);
    res.json({ ok: true });
  });
  app.get("/api/me", (req, res) => res.json(publicUser(req.user) || null));
  app.patch("/api/me", requireUser, (req, res) => {
    const { name, grid: rawGrid = "", bio = "" } = req.body;
    const grid =
      typeof rawGrid === "string"
        ? normalizeText(rawGrid).toUpperCase()
        : rawGrid;
    if (
      !text(name, 80) ||
      !validGrid(grid) ||
      typeof bio !== "string" ||
      bio.length > 500
    )
      return fail(
        res,
        400,
        "Check your name and biography (500 characters maximum). Leave the location grid blank if unknown, or enter a valid 4/6-character code.",
      );
    db.prepare("UPDATE users SET name=?,grid=?,bio=? WHERE id=?").run(
      name.trim(),
      grid.toUpperCase(),
      bio,
      req.user.id,
    );
    res.json(
      publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id)),
    );
  });
  installAccount(app, db, {
    requireUser,
    authLimit,
    changePassword: async (req, res) => {
      const { currentPassword, newPassword, confirmPassword } = req.body || {};
      if (
        typeof currentPassword !== "string" ||
        currentPassword.length > 128 ||
        typeof newPassword !== "string" ||
        !newPassword.trim() ||
        newPassword.length < 12 ||
        newPassword.length > 128 ||
        newPassword !== confirmPassword
      )
        return fail(
          res,
          400,
          "Enter your current password and matching new passwords (12–128 characters, not entirely whitespace).",
        );
      const old = db
        .prepare("SELECT password FROM users WHERE id=?")
        .get(req.user.id).password;
      const [salt, hash] = old.split(":");
      const attempt = await scrypt(currentPassword, salt, 64);
      if (!timingSafeEqual(attempt, Buffer.from(hash, "hex")))
        return fail(res, 403, "Current password is incorrect.");
      const nextSalt = randomBytes(16).toString("hex");
      const next =
        nextSalt +
        ":" +
        (await scrypt(newPassword, nextSalt, 64)).toString("hex");
      db.exec("BEGIN");
      try {
        const result = db
          .prepare("UPDATE users SET password=? WHERE id=? AND password=?")
          .run(next, req.user.id, old);
        if (!result.changes) {
          db.exec("ROLLBACK");
          return fail(
            res,
            409,
            "Password changed in another session. Try again.",
          );
        }
        db.prepare("DELETE FROM sessions WHERE user_id=? AND token!=?").run(
          req.user.id,
          req.token,
        );
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      res.json({ ok: true });
    },
  });
  app.get("/api/operators", requireUser, (req, res) => {
    const q = call(req.query.q).replace(/[%_]/g, "").slice(0, 20);
    res.json(
      db
        .prepare(
          "SELECT id,callsign,name,grid,bio FROM users WHERE callsign LIKE ? AND id!=? ORDER BY callsign LIMIT 30",
        )
        .all(`${q}%`, req.user.id),
    );
  });
  app.get("/api/contacts", requireUser, (req, res) =>
    res.json(
      db
        .prepare(
          "SELECT users.id,callsign,name,grid,bio FROM contacts JOIN users ON users.id=peer WHERE owner=? ORDER BY callsign",
        )
        .all(req.user.id),
    ),
  );
  app.post("/api/contacts/:id", requireUser, (req, res) => {
    const id = Number(req.params.id);
    if (
      id === req.user.id ||
      !db.prepare("SELECT id FROM users WHERE id=?").get(id)
    )
      return fail(res, 404, "Operator not found");
    db.prepare("INSERT OR IGNORE INTO contacts VALUES(?,?)").run(
      req.user.id,
      id,
    );
    res.json({ ok: true });
  });
  app.get("/api/messages/:id", requireUser, (req, res) => {
    const peer = Number(req.params.id);
    res.json(
      db
        .prepare(
          "SELECT * FROM (SELECT id,sender,recipient,body,created FROM messages WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?) ORDER BY id DESC LIMIT 200) ORDER BY id",
        )
        .all(req.user.id, peer, peer, req.user.id),
    );
  });
  app.post("/api/messages/:id", requireUser, (req, res) => {
    const peer = Number(req.params.id);
    if (!text(req.body.body, 2000))
      return fail(res, 400, "Message must contain 1–2,000 characters");
    if (
      peer === req.user.id ||
      !db.prepare("SELECT id FROM users WHERE id=?").get(peer)
    )
      return fail(res, 404, "Operator not found");
    const r = db
      .prepare("INSERT INTO messages(sender,recipient,body) VALUES(?,?,?)")
      .run(req.user.id, peer, req.body.body.trim());
    db.prepare("INSERT OR IGNORE INTO contacts VALUES(?,?)").run(
      req.user.id,
      peer,
    );
    db.prepare("INSERT OR IGNORE INTO contacts VALUES(?,?)").run(
      peer,
      req.user.id,
    );
    res
      .status(201)
      .json(
        db
          .prepare("SELECT * FROM messages WHERE id=?")
          .get(Number(r.lastInsertRowid)),
      );
  });
  app.get("/api/logbook", requireUser, (req, res) =>
    res.json(
      db
        .prepare(
          "SELECT * FROM qsos WHERE owner=? ORDER BY created DESC LIMIT 5000",
        )
        .all(req.user.id),
    ),
  );
  app.post("/api/logbook", requireUser, (req, res) => {
    const { frequency, mode, notes = "", created } = req.body;
    const callsign = call(req.body.callsign);
    if (
      !validCall(callsign) ||
      !Number.isFinite(Number(frequency)) ||
      Number(frequency) <= 0 ||
      Number(frequency) > 300000 ||
      !["SSB", "CW", "FT8", "FT4", "FM", "AM", "RTTY", "DIGITAL"].includes(
        mode,
      ) ||
      typeof notes !== "string" ||
      notes.length > 2000 ||
      !Number.isFinite(Date.parse(created))
    )
      return fail(
        res,
        400,
        "Check callsign, frequency (MHz), mode and UTC date",
      );
    const r = db
      .prepare(
        "INSERT INTO qsos(owner,callsign,frequency,mode,notes,created) VALUES(?,?,?,?,?,?)",
      )
      .run(
        req.user.id,
        callsign,
        Number(frequency),
        mode,
        notes,
        new Date(created).toISOString(),
      );
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  app.delete("/api/logbook/:id", requireUser, (req, res) => {
    db.prepare("DELETE FROM qsos WHERE id=? AND owner=?").run(
      Number(req.params.id),
      req.user.id,
    );
    res.json({ ok: true });
  });
  const feeds = {
    kp: "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
    solar: "https://services.swpc.noaa.gov/json/f107_cm_flux.json",
    iss: "https://api.wheretheiss.at/v1/satellites/25544",
    radar: "https://api.rainviewer.com/public/weather-maps.json",
  };
  const sourceConfig = installSources(app, db, {
    sourcesPath,
    defaultSourcesPath,
    isOffline,
    fetcher: sourceFetcher,
  });
  const cache = new Map();
  sourceConfig.onChange(() => cache.clear());
  app.use("/api", (_req, _res, next) => {
    sourceConfig.refresh();
    next();
  });
  app.get("/api/feeds/:name", async (req, res) => {
    const name = req.params.name;
    if (!feeds[name]) return fail(res, 404, "Unknown feed");
    let item = cache.get(name);
    if (!item) {
      const saved = db
        .prepare("SELECT value,fetched FROM feed_cache WHERE name=?")
        .get(name);
      if (saved)
        try {
          item = { value: JSON.parse(saved.value), time: saved.fetched };
          cache.set(name, item);
        } catch {}
    }
    if (isOffline()) {
      if (item) return res.json({ ...item.value, stale: true, offline: true });
      return fail(
        res,
        503,
        "Offline mode: no saved observation is available yet",
      );
    }
    if (item && Date.now() - item.time < (name === "iss" ? 15000 : 300000))
      return res.json(item.value);
    try {
      const response = await sourceConfig.fetch(feeds[name], {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Upstream unavailable");
      const data = await response.json();
      const value = {
        data,
        source: response.oarSource?.url || feeds[name],
        attribution: response.oarSource?.attribution,
        fetchedAt: new Date().toISOString(),
      };
      const fetched = Date.now();
      cache.set(name, { value, time: fetched });
      db.prepare(
        "INSERT INTO feed_cache(name,value,fetched) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value,fetched=excluded.fetched",
      ).run(name, JSON.stringify(value), fetched);
      res.json(value);
    } catch {
      if (item) return res.json({ ...item.value, stale: true });
      fail(res, 502, "Live source unavailable; try again shortly");
    }
  });
  installMuf(app, db, { isOffline, fetcher: sourceConfig.fetch });
  installMufContours(app, db, { isOffline, fetcher: sourceConfig.fetch });
  installPins(app, db);
  installCities(app, {
    citiesPath,
    db,
    isOffline,
    fetcher: sourceConfig.fetch,
  });
  installWorkspace(app, db);
  installWeather(app, db, { isOffline, fetcher: sourceConfig.fetch });
  installLibrary(app, db);
  installRepeaters(app, db, { isOffline, fetcher: sourceConfig.fetch });
  installGeocoding(app, db, { isOffline, fetcher: sourceConfig.fetch });
  app.use("/api", (req, res) => fail(res, 404, "API route not found"));
  app.use(express.static(path.resolve("dist")));
  app.get("/{*path}", (req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
  app.use((err, req, res, next) => {
    console.error(err.message);
    fail(
      res,
      err.status || 500,
      err.status === 400 ? "Invalid request" : "Server error",
    );
  });
  return { app, db };
}
