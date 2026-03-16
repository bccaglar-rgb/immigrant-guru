const { readFileSync } = require("fs");
const { resolve } = require("path");

// Load .env file if it exists
const envFromFile = {};
try {
  const envPath = resolve(__dirname, ".env");
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    envFromFile[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
} catch {
  // No .env file — use defaults
}

module.exports = {
  apps: [
    {
      name: "bitrium-server",
      script: "server/src/index.ts",
      interpreter: "node",
      interpreter_args: "--experimental-strip-types",
      instances: 3,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: 8090,
        ...envFromFile,
      },
      // Graceful shutdown: 10s to close connections
      kill_timeout: 10000,
      // Auto-restart if a worker exceeds memory budget
      max_memory_restart: "1500M",
      // Merge logs from all workers
      merge_logs: true,
      // Log timestamps
      time: true,
    },
  ],
};
