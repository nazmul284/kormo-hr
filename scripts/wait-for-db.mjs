#!/usr/bin/env node
/**
 * Blocks until Postgres accepts connections. Used by `npm run bootstrap`
 * so `prisma db push` never races the container's first boot.
 */
import net from 'node:net';

const url = new URL(
  process.env.DATABASE_URL ??
    'postgresql://kormo:kormo_dev_pw@localhost:55432/kormo_hr',
);
const host = url.hostname;
const port = Number(url.port || 5432);
const deadline = Date.now() + 90_000;

const probe = () =>
  new Promise((resolve) => {
    const sock = net
      .connect({ host, port })
      .setTimeout(2000)
      .on('connect', () => sock.end(resolve(true)))
      .on('timeout', () => sock.destroy(resolve(false)))
      .on('error', () => resolve(false));
  });

process.stdout.write(`waiting for postgres at ${host}:${port} `);
while (Date.now() < deadline) {
  if (await probe()) {
    console.log('\n✓ postgres is accepting connections');
    process.exit(0);
  }
  process.stdout.write('.');
  await new Promise((r) => setTimeout(r, 1500));
}
console.error('\n✗ timed out waiting for postgres');
process.exit(1);
