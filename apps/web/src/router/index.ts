import {
  createRouter,
  createWebHistory,
} from 'vue-router';

import DashboardView from '../views/DashboardView.vue';
import NotFoundView from '../views/NotFoundView.vue';
import ProjectDetailsView from '../views/ProjectDetailsView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
      meta: {
        eyebrow: 'Ambiente local',
        title: 'Visão geral',
      },
    },
    {
      path: '/projects/:projectId',
      name: 'project-details',
      component: ProjectDetailsView,
      meta: {
        eyebrow: 'Projeto local',
        title: 'Detalhes do projeto',
      },
    },
    {
      path: '/projects/:projectId/git',
      name: 'project-git',
      component: ProjectDetailsView,
      meta: {
        eyebrow: 'Projeto local',
        title: 'Git do projeto',
      },
    },
    {
      path: '/projects/:projectId/tests',
      name: 'project-tests',
      component: ProjectDetailsView,
      meta: {
        eyebrow: 'Projeto local',
        title: 'Testes do projeto',
      },
    },
    {
      path: '/projects/:projectId/database',
      name: 'project-database',
      component: ProjectDetailsView,
      meta: { eyebrow: 'Projeto local', title: 'Banco de dados do projeto' },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFoundView,
      meta: {
        eyebrow: 'Navegação',
        title: 'Página não encontrada',
      },
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
