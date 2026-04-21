// PM2 ecosystem — Immigrant Guru production
//
// SECURITY: Run PM2 and all app processes as an unprivileged user, NOT root.
// One-time server setup:
//   useradd -r -m -s /bin/bash appuser
//   chown -R appuser:appuser /opt/app/immigrant-guru /var/log/immigrant
//   pm2 startup systemd -u appuser --hp /home/appuser
//   # Then run all pm2 commands as appuser:
//   sudo -u appuser pm2 start /opt/app/immigrant-guru/ecosystem.config.cjs
//   sudo -u appuser pm2 save

const APP_DIR = '/opt/app/immigrant-guru';

module.exports = {
  apps: [
    {
      name: 'web',
      cwd: APP_DIR + '/apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '800M',
      env: { NODE_ENV: 'production', PORT: '3000' },
      merge_logs: true,
      time: true,
      out_file: '/var/log/immigrant/web.out.log',
      error_file: '/var/log/immigrant/web.err.log',
    },
    {
      name: 'api',
      cwd: APP_DIR + '/apps/api',
      script: APP_DIR + '/apps/api/.venv/bin/uvicorn',
      args: 'app.main:app --host 127.0.0.1 --port 8000 --workers 4',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1200M',
      merge_logs: true,
      time: true,
      out_file: '/var/log/immigrant/api.out.log',
      error_file: '/var/log/immigrant/api.err.log',
    },
    {
      name: 'worker',
      cwd: APP_DIR + '/apps/worker',
      script: APP_DIR + '/apps/worker/.venv/bin/python',
      args: '-m app.main',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '400M',
      merge_logs: true,
      time: true,
      out_file: '/var/log/immigrant/worker.out.log',
      error_file: '/var/log/immigrant/worker.err.log',
      restart_delay: 5000,
    },
  ],
};
