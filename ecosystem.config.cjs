// PM2 processes for the installed MyEnergy app. Build first:
//   pnpm app:build && pnpm --filter @myenergy/api build
// then:  pm2 start ecosystem.config.cjs && pm2 save
// `pm2 resurrect` at logon (scheduled task) brings both back after a reboot.
const path = require('node:path');

const web = path.join(__dirname, 'apps', 'web');
const api = path.join(__dirname, 'apps', 'api');

module.exports = {
  apps: [
    {
      name: 'myenergy-app',
      cwd: web,
      // Run Next directly (not through a wrapper) so PM2 owns the process holding the port.
      script: path.join(web, 'node_modules', 'next', 'dist', 'bin', 'next'),
      args: 'start -p 3210',
      env: { NODE_ENV: 'production', NEXT_DIST_DIR: '.next-app' },
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: 'myenergy-api',
      cwd: api,
      script: path.join(api, 'dist', 'main.js'),
      env: {
        PORT: '4000',
        WEB_ORIGIN: 'http://localhost:3210,http://127.0.0.1:3210,http://localhost:3000,http://127.0.0.1:3000',
      },
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
