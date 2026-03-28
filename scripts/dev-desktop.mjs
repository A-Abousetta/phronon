import { spawn } from "node:child_process";
import http from "node:http";
import process from "node:process";
import { fileURLToPath } from "node:url";

const desktopDir = new URL("../apps/desktop/", import.meta.url);
const desktopPath = fileURLToPath(desktopDir);
const rendererUrl = "http://localhost:5173";
const children = [];
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function spawnProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options
  });

  children.push(child);
  child.on("exit", (code) => {
    if (code && code !== 0) {
      shutdown(code);
    }
  });

  return child;
}

function waitForServer(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      http
        .get(url, (response) => {
          response.resume();
          resolve();
        })
        .on("error", () => {
          if (Date.now() >= deadline) {
            reject(new Error(`Timed out waiting for ${url}`));
            return;
          }

          setTimeout(attempt, 250);
        });
    };

    attempt();
  });
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }

  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

spawnProcess(npmCommand, ["run", "renderer:dev"], {
  cwd: desktopPath
});

try {
  await waitForServer(rendererUrl);
  spawnProcess(npmCommand, ["run", "electron:dev"], {
    cwd: desktopPath,
    env: {
      ...process.env,
      PHRONON_RENDERER_URL: rendererUrl
    }
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
}
