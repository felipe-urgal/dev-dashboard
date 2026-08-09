import { createMemoryHistory, createRouter, type Router } from 'vue-router';

const stub = { template: '<div />' };

/**
 * Router mínimo para montar componentes que usam `useRoute()`/`useRouter()`
 * fora do `<RouterView>` real — sem isso o Vue emite "injection ... not found"
 * e qualquer `router.push`/leitura de `route.query` falha silenciosamente.
 * Só as rotas com `name` referenciadas pelos componentes testados; adicione
 * conforme necessário.
 */
export function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'dashboard', component: stub },
      {
        path: '/projects/:projectId',
        name: 'project-details',
        component: stub,
      },
      {
        path: '/projects/:projectId/server',
        name: 'project-server',
        component: stub,
      },
      {
        path: '/projects/:projectId/git',
        name: 'project-git',
        component: stub,
      },
      {
        path: '/projects/:projectId/tests',
        name: 'project-tests',
        component: stub,
      },
      {
        path: '/projects/:projectId/database',
        name: 'project-database',
        component: stub,
      },
      {
        path: '/projects/:projectId/dependencies',
        name: 'project-dependencies',
        component: stub,
      },
      {
        path: '/projects/:projectId/environment',
        name: 'project-environment',
        component: stub,
      },
    ],
  });
}

export async function mountedTestRouter(): Promise<Router> {
  const router = createTestRouter();
  await router.push('/');
  await router.isReady();
  return router;
}
