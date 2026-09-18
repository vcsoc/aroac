import { AsyncLocalStorage } from "node:async_hooks";
export const sessionScope = new AsyncLocalStorage();
export const ownerId = (req) => req.user?.id ?? null;
export const visible = "(owner IS NULL OR owner=?)";
export function addOwnership(db, table) {
  if (!["pins", "address_contacts"].includes(table))
    throw Error("Invalid ownership table");
  if (
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .some((c) => c.name === "owner")
  )
    return;
  // Historical records have no reliable authorship. Never expose them as General
  // when profiles already exist. Preserve ambiguous records in a locked legacy scope.
  const users = db
    .prepare("SELECT name FROM sqlite_master WHERE name='users'")
    .get()
    ? db.prepare("SELECT id FROM users ORDER BY id").all()
    : [];
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN owner INTEGER`);
    if (users.length)
      db.prepare(`UPDATE ${table} SET owner=?`).run(
        users.length === 1 ? users[0].id : -1,
      );
    db.exec(`CREATE INDEX IF NOT EXISTS ${table}_owner ON ${table}(owner)`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function preference(db, key, owner = sessionScope.getStore() ?? 0) {
  const privateValue = owner
    ? db
        .prepare(
          "SELECT value FROM private_preferences WHERE owner=? AND key=?",
        )
        .get(owner, key)?.value
    : undefined;
  return (
    privateValue ??
    db.prepare("SELECT value FROM workspace_preferences WHERE key=?").get(key)
      ?.value
  );
}
