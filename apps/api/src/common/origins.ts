const LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * Allowed browser origins for CORS and Socket.IO: `WEB_ORIGIN` (comma-separated), plus any
 * localhost port outside production so `next dev`, `next start` and Playwright all work.
 */
export function webOrigins(): (string | RegExp)[] {
  const list = (process.env.WEB_ORIGIN ?? 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return process.env.NODE_ENV === 'production' ? list : [...list, LOCALHOST];
}
