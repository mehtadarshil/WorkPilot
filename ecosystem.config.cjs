// PM2 ecosystem file for the WorkPilot monorepo (Item 5).
//
// Lives at the WorkPilot repo root so `pm2 reload ecosystem.config.cjs` (or
// `pm2 startOrReload`) can be run from /home/ubuntu/WorkPilot/ on the
// production server.
//
// Apps managed here:
//   - workpilot-backend   (Express API on :4000  — proxied as api.work-pilot.co)
//   - workpilot-frontend  (Next.js on :3001      — proxied as work-pilot.co)
//
// Sister file: /home/ubuntu/valmont-security/ecosystem.config.cjs
//   (backend + frontend for the Valmont apps).
//
// See the comments in the Valmont ecosystem.config.cjs for rationale on each
// reliability knob (max_memory_restart / max_restarts / min_uptime / etc).
//
// Environment variables: NOT defined here. WorkPilot backend + frontend both
// load config from .env files in their own cwd via dotenv. Don't add an
// `env:` block unless you also remove the keys from the .env files.

const path = require('path');

const PM2_LOGS = '/home/ubuntu/.pm2/logs';

module.exports = {
  apps: [
    {
      name: 'workpilot-backend',
      cwd: path.join(__dirname, 'backend'),
      script: 'dist/index.js',
      exec_mode: 'fork',
      instances: 1,

      max_memory_restart: '768M',
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 5000,
      restart_delay: 2000,
      autorestart: true,
      watch: false,

      out_file: `${PM2_LOGS}/workpilot-backend-out.log`,
      error_file: `${PM2_LOGS}/workpilot-backend-error.log`,
      merge_logs: true,
      time: true,
    },
    {
      name: 'workpilot-frontend',
      cwd: path.join(__dirname, 'frontend'),
      script: 'npm',
      args: 'run start',
      exec_mode: 'fork',
      instances: 1,

      max_memory_restart: '1024M',
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 5000,
      restart_delay: 2000,
      autorestart: true,
      watch: false,

      out_file: `${PM2_LOGS}/workpilot-frontend-out.log`,
      error_file: `${PM2_LOGS}/workpilot-frontend-error.log`,
      merge_logs: true,
      time: true,
    },
  ],
};
