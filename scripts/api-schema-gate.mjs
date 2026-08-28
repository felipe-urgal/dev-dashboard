export function findHttpRoutesWithoutSchema(routes) {
  return routes.filter((route) => !route.schema && route.websocket !== true);
}

export function assertExplicitHttpSchemas(routes) {
  const missingRoutes = findHttpRoutesWithoutSchema(routes);

  if (missingRoutes.length === 0) return;

  const details = missingRoutes
    .map(
      (route) =>
        `- ${route.method} ${route.url}${route.group ? ` (${route.group})` : ''}`,
    )
    .join('\n');

  throw new Error(
    '[docs:api] Rotas HTTP comuns sem schema explícito:\n' +
      `${details}\n` +
      'Declare o schema da rota. WebSockets são a única exceção e precisam declarar `websocket: true` explicitamente.',
  );
}
