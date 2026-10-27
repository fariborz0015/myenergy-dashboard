// Creates apps/api/.env from .env.example on first run so `pnpm dev` works out of the box.
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = join(root, '.env');
if (!existsSync(env)) {
  copyFileSync(join(root, '.env.example'), env);
  console.log('[api] created .env from .env.example');
}
