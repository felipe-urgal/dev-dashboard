import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue'),
    },
    {
      path: '/processes',
      name: 'processes',
      component: () => import('../views/ProcessesView.vue'),
    },
    {
      path: '/database',
      name: 'database',
      component: () => import('../views/DatabaseView.vue'),
    },
    {
      path: '/projects/:projectId',
      name: 'project-details',
      component: () => import('../views/ProjectDetailsView.vue'),
    },
    {
      path: '/projects/:projectId/readme',
      name: 'project-readme',
      component: () => import('../views/ProjectDetailsView.vue'),
    },
    {
      path: '/projects/:projectId/doctor',
      name: 'project-doctor',
      component: () => import('../views/ProjectDetailsView.vue'),
    },
    {
      path: '/projects/:projectId/server',
      name: 'project-server',
      component: () => import('../views/ProjectDetailsView.vue'),
    },
    {
      path: '/projects/:projectId/logs',
      redirect: (to) => ({ name: 'project-server', params: to.params }),
    },
    {
      path: '/projects/:projectId/git',
      name: 'project-git',
      component: () => import('../views/ProjectDetailsView.vue'),
    },
    {
      path: '/projects/:projectId/tests',
      name: 'project-tests',
      component: () => import('../views/ProjectDetailsView.vue'),
    },
    {
      path: '/projects/:projectId/production',
      name: 'project-production',
      component: () => import('../views/ProjectDetailsView.vue'),
    },
    {
      path: '/projects/:projectId/database',
      redirect: { name: 'database' },
    },
    {
      path: '/projects/:projectId/dependencies',
      name: 'project-dependencies',
      component: () => import('../views/ProjectDetailsView.vue'),
    },
    {
      path: '/projects/:projectId/sidekiq',
      name: 'project-rails-sidekiq',
      component: () => import('../views/ProjectDetailsView.vue'),
    },
    {
      path: '/projects/:projectId/webpack',
      name: 'project-rails-webpack',
      component: () => import('../views/ProjectDetailsView.vue'),
    },
    {
      path: '/projects/:projectId/terminal',
      name: 'project-terminal',
      component: () => import('../views/ProjectDetailsView.vue'),
    },
    {
      path: '/projects/:projectId/console',
      name: 'project-console',
      component: () => import('../views/ProjectDetailsView.vue'),
    },
    {
      path: '/projects/:projectId/environment',
      name: 'project-environment',
      component: () => import('../views/ProjectDetailsView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundView.vue'),
    },
  ],
  scrollBehavior(to) {
    if (to.hash) {
      return {
        el: to.hash,
        top: 92,
      };
    }

    return {
      top: 0,
    };
  },
});
