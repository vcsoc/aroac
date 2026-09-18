import { preference, ownerId } from "./privacy.js";
import { validateTheme, validateTimeConfig } from "../shared/workspace.js";
import { validateAppearance } from "../shared/appearance.js";
export function installWorkspace(app, db) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS workspace_preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  );
  const firstMigration = !db
    .prepare("SELECT name FROM sqlite_master WHERE name='private_preferences'")
    .get();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(
      "CREATE TABLE IF NOT EXISTS private_preferences(owner INTEGER NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(owner,key))",
    );
    if (firstMigration) {
      const users = db
        .prepare("SELECT name FROM sqlite_master WHERE name='users'")
        .get()
        ? db.prepare("SELECT id FROM users").all()
        : [];
      if (users.length) {
        db.prepare(
          "INSERT OR IGNORE INTO private_preferences SELECT ?,key,value FROM workspace_preferences WHERE key='world-time'",
        ).run(users.length === 1 ? users[0].id : -1);
        db.exec("DELETE FROM workspace_preferences WHERE key='world-time'");
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const validators = {
    "world-time": validateTimeConfig,
    theme: validateTheme,
    appearance: validateAppearance,
  };
  app.get("/api/preferences/:key", (req, res) => {
    if (!Object.hasOwn(validators, req.params.key)) return res.sendStatus(404);
    res.json({
      value: JSON.parse(
        preference(db, req.params.key, ownerId(req) ?? 0) || "null",
      ),
    });
  });
  app.put("/api/preferences/:key", (req, res) => {
    if (!Object.hasOwn(validators, req.params.key)) return res.sendStatus(404);
    try {
      const value = validators[req.params.key](req.body);
      if (req.user)
        db.prepare(
          "INSERT OR REPLACE INTO private_preferences VALUES(?,?,?)",
        ).run(req.user.id, req.params.key, JSON.stringify(value));
      else
        db.prepare(
          "INSERT OR REPLACE INTO workspace_preferences VALUES(?,?)",
        ).run(req.params.key, JSON.stringify(value));
      res.json({ value });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
}
