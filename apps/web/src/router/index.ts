import {
  createRouter,
  createWebHistory,
} from 'vue-router';

import ActivityView from '../views/ActivityView.vue';
import DashboardView from '../views/DashboardView.vue';
import NotFoundView from '../views/NotFoundView.vue';
import ProcessesView from '../views/ProcessesView.vue';
import ProjectDetailsView from '../views/ProjectDetailsView.vue';
import SettingsView from '../views/SettingsView.vue';

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
      path: '/activity',
      name: 'activity',
      component: ActivityView,
      meta: {
        eyebrow: 'Ambiente local',
        title: 'Painel de atividade',
      },
    },
    {
      path: '/processes',
      name: 'processes',
      component: ProcessesView,
      meta: {
        eyebrow: 'Ambiente local',
        title: 'Processos gerenciados',
      },
    },
    {
      path: '/settings', name: 'settings', component: SettingsView,
      meta: { eyebrow: 'Ambiente local', title: 'Configurações' },
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
      path: '/projects/:projectId/server',
      name: 'project-server',
      component: ProjectDetailsView,
      meta: {
        eyebrow: 'Projeto local',
        title: 'Servidor do projeto',
      },
    },
    {
      path: '/projects/:projectId/logs',
      name: 'project-logs',
      component: ProjectDetailsView,
      meta: {
        eyebrow: 'Projeto local',
        title: 'Logs do projeto',
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
      path: '/projects/:projectId/docker',
      name: 'project-docker',
      component: ProjectDetailsView,
      meta: { eyebrow: 'Projeto local', title: 'Docker Compose do projeto' },
    },
    {
      path: '/projects/:projectId/scripts',
      name: 'project-scripts',
      component: ProjectDetailsView,
      meta: { eyebrow: 'Projeto local', title: 'Scripts e tarefas do projeto' },
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
