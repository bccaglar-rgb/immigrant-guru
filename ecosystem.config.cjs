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
