import { startFixtureServer, stopFixtureServer } from './fixtures/server-harness';
import { writeRuntimeInfo } from './fixtures/runtime-info';

export default async function globalSetup(): Promise<() => Promise<void>> {
  const server = await startFixtureServer();
  await writeRuntimeInfo({
    baseUrl: server.baseUrl,
    bootstrapToken: server.bootstrapToken,
  });

  return async () => {
    await stopFixtureServer(server);
  };
}
