import { readdir } from 'node:fs/promises';
import path from 'node:path';

import type { Project } from '@dev-dashboard/contracts';

/**
 * "primary" sempre existe; um banco secundário aparece como `db/<nome>_schema.rb`
 * (convenção do Rails para múltiplos bancos por ambiente, ver database.yml).
 */
export async function listDatabases(project: Project): Promise<string[]> {
  try {
    const files = await readdir(path.join(project.path, 'db'));
    const secondary = files
      .filter(
        (file) =>
          file !== 'schema.rb' && /^[a-z][a-z0-9_]*_schema\.rb$/.test(file),
      )
      .map((file) => file.replace(/_schema\.rb$/, ''))
      .sort();
    return ['primary', ...secondary];
  } catch {
    return ['primary'];
  }
}
