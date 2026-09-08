import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import dotenv from 'dotenv';

/**
 * Loads .env before anything else is imported.
 *
 * `loadConfig()` runs at module-import time (so a misconfiguration fails
 * the process rather than the first request), which is earlier than
 * `ConfigModule.forRoot()` gets a chance to populate `process.env`. This
 * module must therefore be the very first import in main.ts.
 *
 * Candidates are tried in order so the API works whether it is started
 * from apps/api, from the repo root via a workspace script, or from dist.
 */
const candidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
  resolve(__dirname, '../.env'),
  resolve(__dirname, '../../../.env'),
];

for (const path of candidates) {
  if (existsSync(path)) {
    dotenv.config({ path });
    break;
  }
}
