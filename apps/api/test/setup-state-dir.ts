import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isola o estado local para que os testes não leiam nem gravem em ~/.local/state.
const stateDirectory = mkdtempSync(
  path.join(os.tmpdir(), 'dev-dashboard-test-'),
);
process.env.DEV_DASHBOARD_STATE_DIR = stateDirectory;
process.on('exit', () =>
  rmSync(stateDirectory, { recursive: true, force: true }),
);
