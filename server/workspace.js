import { validateTheme, validateTimeConfig } from "../shared/workspace.js";
import { validateAppearance } from "../shared/appearance.js";
export function installWorkspace(app, db) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS workspace_preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  );
  const validators = {
    "world-time": validateTimeConfig,
    theme: validateTheme,
    appearance: validateAppearance,
  };
  app.get("/api/preferences/:key", (req, res) => {
    if (!Object.hasOwn(validators, req.params.key)) return res.sendStatus(404);
    res.json({
      value: JSON.parse(
        db
          .prepare("SELECT value FROM workspace_preferences WHERE key=?")
          .get(req.params.key)?.value || "null",
      ),
    });
  });
  app.put("/api/preferences/:key", (req, res) => {
    if (!Object.hasOwn(validators, req.params.key)) return res.sendStatus(404);
    try {
      const value = validators[req.params.key](req.body);
      db.prepare(
        "INSERT OR REPLACE INTO workspace_preferences VALUES(?,?)",
      ).run(req.params.key, JSON.stringify(value));
      res.json({ value });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
}
