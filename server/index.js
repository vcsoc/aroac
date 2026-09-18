import { createApp } from "./app.js";
const { app, db } = createApp({
  dbPath: process.env.DATABASE_PATH || "data/oar.sqlite",
});
const server = app.listen(
  Number(process.env.PORT) || 3001,
  process.env.HOST || "127.0.0.1",
  () =>
    console.log("OAR server listening on port " + (process.env.PORT || 3001)),
);
process.on("SIGTERM", () =>
  server.close(() => {
    db.close();
    process.exit(0);
  }),
);
