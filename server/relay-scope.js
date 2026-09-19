// Local-only random scope, not the network device ID. Integer SQLite user IDs
// can be reused after deletion/restore and must never select old private keys.
export function installRelayScopes(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS relay_profile_scopes (
      owner INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      scope TEXT NOT NULL UNIQUE
    );
    INSERT OR IGNORE INTO relay_profile_scopes(owner,scope)
      SELECT id,lower(hex(randomblob(16))) FROM users;
    CREATE TRIGGER IF NOT EXISTS relay_scope_new_user AFTER INSERT ON users
    BEGIN
      INSERT OR REPLACE INTO relay_profile_scopes(owner,scope)
        VALUES(new.id,lower(hex(randomblob(16))));
    END;
  `);
  return (owner) =>
    db
      .prepare("SELECT scope FROM relay_profile_scopes WHERE owner=?")
      .get(owner)?.scope ?? null;
}
