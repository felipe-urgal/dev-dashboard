import { createRouter, createWebHistory } from 'vue-router';

import DashboardView from '../views/DashboardView.vue';
import NotFoundView from '../views/NotFoundView.vue';
import ProcessesView from '../views/ProcessesView.vue';
import ProjectDetailsView from '../views/ProjectDetailsView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
    },
    {
      path: '/processes',
      name: 'processes',
      component: ProcessesView,
    },
    {
      path: '/projects/:projectId',
      name: 'project-details',
      component: ProjectDetailsView,
    },
    {
      path: '/projects/:projectId/doctor',
      name: 'project-doctor',
      component: ProjectDetailsView,
    },
    {
      path: '/projects/:projectId/server',
      name: 'project-server',
      component: ProjectDetailsView,
    },
    {
      path: '/projects/:projectId/logs',
      redirect: (to) => ({ name: 'project-server', params: to.params }),
    },
    {
      path: '/projects/:projectId/git',
      name: 'project-git',
      component: ProjectDetailsView,
    },
    {
      path: '/projects/:projectId/tests',
      name: 'project-tests',
      component: ProjectDetailsView,
    },
    {
      path: '/projects/:projectId/database',
      name: 'project-database',
      component: ProjectDetailsView,
    },
    {
      path: '/projects/:projectId/dependencies',
      name: 'project-dependencies',
      component: ProjectDetailsView,
    },
    {
      path: '/projects/:projectId/sidekiq',
      name: 'project-rails-sidekiq',
      component: ProjectDetailsView,
    },
    {
      path: '/projects/:projectId/webpack',
      name: 'project-rails-webpack',
      component: ProjectDetailsView,
    },
    {
      path: '/projects/:projectId/terminal',
      name: 'project-terminal',
      component: ProjectDetailsView,
    },
    {
      path: '/projects/:projectId/console',
      name: 'project-console',
      component: ProjectDetailsView,
    },
    {
      path: '/projects/:projectId/environment',
      name: 'project-environment',
      component: ProjectDetailsView,
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFoundView,
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
