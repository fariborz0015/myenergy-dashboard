import { execSync } from 'node:child_process';
import { join } from 'node:path';

/** Sync the schema of the e2e test database (prisma/test.db, git-ignored); the suite empties its tables itself. */
export default function globalSetup() {
  execSync('prisma db push --skip-generate', {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: 'file:./test.db', PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: 'pipe',
  });
}
