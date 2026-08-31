/**
 * Catálogo ordenado de scripts Node que representam um servidor gerenciável.
 *
 * Project Discovery usa esta lista para conceder a capability `server` e o
 * Process Manager usa a mesma ordem para escolher o comando executável. Manter
 * uma fonte única evita estados em que a UI bloqueia um script que o runtime
 * saberia executar (ou o inverso).
 */
export const NODE_SERVER_SCRIPT_CANDIDATES = [
  'dev',
  'start',
  'serve',
  'api:dev',
  'api:start',
  'api:serve',
  'server:dev',
  'server:start',
  'server:serve',
  'web:dev',
  'web:start',
  'web:serve',
  'app:dev',
  'app:start',
  'app:serve',
] as const;

export type NodeServerScriptName =
  (typeof NODE_SERVER_SCRIPT_CANDIDATES)[number];
