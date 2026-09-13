import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EmployeeProfilePage } from './profile-page';

/**
 * Employee IDs the static demo export pre-renders.
 *
 * `output: 'export'` has no server to render an arbitrary `[id]` on
 * demand, so every reachable profile has to be enumerated at build time.
 *
 * The list is read out of the recorded fixture bundle rather than guessed
 * as a numeric range: the bundle is the definition of which profiles the
 * demo can actually show, so deriving it means the two cannot disagree.
 * A guessed range is how this first went wrong — it assumed IDs started
 * at 101, and every colleague card in the directory prefetched a 404.
 *
 * Outside the demo build this returns nothing and Next renders whatever
 * ID is requested, as normal.
 */
export function generateStaticParams(): { id: string }[] {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== '1') return [];

  const root = join(process.cwd(), 'public', 'demo-data');
  const ids = new Set<string>();

  try {
    for (const role of readdirSync(root)) {
      const manifest = JSON.parse(
        readFileSync(join(root, role, 'manifest.json'), 'utf8'),
      ) as { keys?: string[] };
      for (const key of manifest.keys ?? []) {
        // Matches "/employees/37" and "/employees/37/documents" alike.
        const match = /^\/employees\/(\d+)(?:[/?]|$)/.exec(key);
        if (match) ids.add(match[1]);
      }
    }
  } catch {
    // No bundle yet (a fresh clone building the demo before capturing).
    // The deploy workflow fails the build for this separately, with a
    // message that says how to fix it.
  }

  return [...ids].sort((a, b) => Number(a) - Number(b)).map((id) => ({ id }));
}

export default function Page() {
  return <EmployeeProfilePage />;
}
