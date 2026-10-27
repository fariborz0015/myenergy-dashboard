/**
 * Side-effect import: loads apps/api/.env (Node >= 20.12) before anything reads
 * `process.env`. Variables that are already set win.
 */
try {
  process.loadEnvFile();
} catch {
  // no .env — rely on the real environment
}
