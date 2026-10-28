// Build / serve the installable app on its own port and build folder:
//   node scripts/app.mjs build   → next build into .next-app
//   node scripts/app.mjs start   → next start on http://localhost:3210
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.APP_PORT ?? '3210';
const cmd = process.argv[2];
const args = cmd === 'build' ? ['build'] : cmd === 'start' ? ['start', '-p', port] : null;
if (!args) {
  console.error('usage: node scripts/app.mjs <build|start>');
  process.exit(1);
}
const child = spawn(process.execPath, [join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), ...args], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NEXT_DIST_DIR: '.next-app', NODE_ENV: 'production' },
});
child.on('exit', (code) => process.exit(code ?? 0));
