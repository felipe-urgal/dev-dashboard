export function parseServerPort(
  value: string | number | null | undefined,
): number | null {
  const rawPort = String(value ?? '').trim();

  if (!rawPort) {
    return null;
  }

  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error('A porta deve estar entre 1024 e 65535.');
  }

  return port;
}
