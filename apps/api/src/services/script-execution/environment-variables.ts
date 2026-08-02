const PROTECTED_ENVIRONMENT_VARIABLES = new Set([
  'BUNDLE_BIN_PATH',
  'BUNDLE_GEMFILE',
  'BUNDLE_PATH',
  'COMSPEC',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'GEM_HOME',
  'GEM_PATH',
  'HOME',
  'LD_LIBRARY_PATH',
  'LD_PRELOAD',
  'NODE_OPTIONS',
  'PATH',
  'PATHEXT',
  'RUBYLIB',
  'RUBYOPT',
  'SHELL',
  'SYSTEMROOT',
  'USERPROFILE',
]);

export function isProtectedScriptEnvironmentVariable(name: string): boolean {
  return PROTECTED_ENVIRONMENT_VARIABLES.has(name);
}
