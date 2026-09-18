const { spawn } = require("node:child_process");
const child = spawn(require("electron"), ["."], {
  stdio: "inherit",
  env: { ...process.env, OAR_DEV_URL: "http://127.0.0.1:5173" },
});
child.on("exit", (code) => process.exit(code || 0));
