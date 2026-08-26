import { spawn } from "node:child_process";

const children = [
  spawn(process.execPath, ["server/index.js"], { stdio: "inherit", env: process.env }),
  spawn("npx", ["vite", "--host", "127.0.0.1", "--port", "5173"], {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  }),
];

const stop = () => {
  for (const child of children) child.kill("SIGTERM");
  process.exit(0);
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) child.on("exit", (code) => {
  if (code) process.exit(code);
});
