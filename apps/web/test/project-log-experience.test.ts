import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ProjectLogExperience from '../src/components/ProjectLogExperience.vue';

describe('ProjectLogExperience', () => {
  it('abre no fluxo, filtra e investiga problemas sem duplicar a saída', async () => {
    const wrapper = mount(ProjectLogExperience, {
      props: {
        source: 'sidekiq',
        content: [
          '16:18:21 jid=abc class=SyncProductsJob queue=default started',
          '16:18:27 jid=abc class=SyncProductsJob done 6.2s',
          '16:18:30 jid=def class=GenerateReportJob ERROR RuntimeError: boom',
          '16:18:31 jid=def retrying in 30 seconds',
        ].join('\n'),
      },
      slots: {
        'diagnostic-extra':
          '<div class="extra-diagnostic">Detalhe especializado</div>',
      },
    });

    const modes = wrapper.findAll('.log-experience-mode-switch button');
    expect(modes[0]?.classes()).toContain('active');
    expect(wrapper.findAll('.log-experience-line')).toHaveLength(4);

    const errorFilter = wrapper
      .findAll('.log-experience-filters button')
      .find((button) => button.text() === 'Erros');
    expect(errorFilter).toBeDefined();
    await errorFilter?.trigger('click');
    expect(wrapper.findAll('.log-experience-line')).toHaveLength(1);
    expect(wrapper.text()).toContain('RuntimeError');

    await modes[1]?.trigger('click');
    expect(wrapper.find('.log-experience-diagnostic').exists()).toBe(true);
    expect(wrapper.text()).toContain('Problemas encontrados');
    expect(wrapper.text()).toContain('Retries');
    expect(wrapper.text()).toContain('Detalhe especializado');
  });

  it('mostra estado saudável quando não encontra problemas', async () => {
    const wrapper = mount(ProjectLogExperience, {
      props: {
        source: 'webpack',
        content: 'Compiled /dashboard in 320ms',
      },
    });

    await wrapper
      .findAll('.log-experience-mode-switch button')[1]
      ?.trigger('click');
    expect(wrapper.text()).toContain('Nenhum problema evidente encontrado');
  });
});
