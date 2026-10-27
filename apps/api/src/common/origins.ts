export function webOrigins(): string[] {
  return (process.env.WEB_ORIGIN ?? 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
