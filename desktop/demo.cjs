// Entire demo database lives in RAM. No user profile, sources file or login is copied.
const { randomBytes, createHash } = require("node:crypto");
const wonders = [
  ["Great Wall of China", 40.4319, 116.5704],
  ["Petra", 30.3285, 35.4444],
  ["Christ the Redeemer", -22.9519, -43.2105],
  ["Machu Picchu", -13.1631, -72.545],
  ["Chichén Itzá", 20.6843, -88.5678],
  ["Colosseum", 41.8902, 12.4922],
  ["Taj Mahal", 27.1751, 78.0421],
  ["Great Pyramid of Giza", 29.9792, 31.1342],
];
function createDemo(createApp, options) {
  const service = createApp({
    ...options,
    dbPath: ":memory:",
    sourcesPath: undefined,
  });
  const { db } = service;
  const token = randomBytes(32).toString("hex");
  db.prepare(
    "INSERT INTO users(callsign,name,email,password,grid,bio) VALUES(?,?,?,?,?,?)",
  ).run(
    "DEMO",
    "Demo Operator",
    "demo@invalid.local",
    randomBytes(32).toString("hex"),
    "AA00aa",
    "Disposable demo workspace",
  );
  const owner = Number(
    db.prepare("SELECT id FROM users WHERE callsign='DEMO'").get().id,
  );
  db.prepare("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)").run(
    createHash("sha256").update(token).digest("hex"),
    owner,
    Date.now() + 86400000,
  );
  const pin = db.prepare(
    "INSERT INTO pins(label,callsign,lat,lng,notes,created,updated,name,owner) VALUES(?,?,?,?,?,?,?,?,?)",
  );
  const now = new Date().toISOString();
  for (const [label, lat, lng] of wonders)
    pin.run(
      label,
      "",
      lat,
      lng,
      "Demo location · coordinates approximate",
      now,
      now,
      "",
      owner,
    );
  return { ...service, token };
}
module.exports = { createDemo, wonders };
