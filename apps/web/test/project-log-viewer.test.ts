import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProjectLogViewer from '../src/components/ProjectLogViewer.vue';

describe('ProjectLogViewer', () => {
  const writeText = vi.fn<(content: string) => Promise<void>>();

  beforeEach(() => {
    writeText.mockReset();
    writeText.mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it('mantém o conteúdo selecionável e permite copiar o log completo', async () => {
    const wrapper = mount(ProjectLogViewer, {
      props: { content: 'linha 1\nlinha 2', title: 'Saída' },
    });

    expect(
      wrapper.get('.project-log-viewer-output').attributes('tabindex'),
    ).toBe('0');
    expect(wrapper.get('pre').text()).toBe('linha 1\nlinha 2');

    await wrapper
      .get('button[aria-label="Copiar todo o log"]')
      .trigger('click');

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith('linha 1\nlinha 2');
    expect(wrapper.text()).toContain('Copiado');
  });

  it('remove sequências ANSI da leitura e da cópia', async () => {
    const wrapper = mount(ProjectLogViewer, {
      props: { content: '\u001b[32m✓ concluído\u001b[0m' },
    });

    expect(wrapper.get('pre').text()).toBe('✓ concluído');
    await wrapper
      .get('button[aria-label="Copiar todo o log"]')
      .trigger('click');
    expect(writeText).toHaveBeenCalledWith('✓ concluído');
  });

  it('apresenta estado, proteção de conteúdo e estado vazio de forma padronizada', () => {
    const wrapper = mount(ProjectLogViewer, {
      props: {
        content: '',
        title: 'Log da atualização',
        running: true,
        maskedCount: 2,
        truncated: true,
      },
    });

    expect(wrapper.text()).toContain('Ao vivo');
    expect(wrapper.text()).toContain('2 segredos ocultados');
    expect(wrapper.text()).toContain('O início do log foi truncado');
    expect(wrapper.get('pre').text()).toBe('Nenhuma saída registrada.');
    expect(
      wrapper.get('button[aria-label="Copiar todo o log"]').attributes(),
    ).toHaveProperty('disabled');
  });

  it('pausa o acompanhamento quando o usuário sobe e permite retomá-lo', async () => {
    const wrapper = mount(ProjectLogViewer, {
      props: { content: 'linha 1', running: true },
    });
    const element = wrapper.get('.project-log-viewer-output')
      .element as HTMLElement;

    Object.defineProperty(element, 'scrollHeight', {
      configurable: true,
      value: 300,
    });
    Object.defineProperty(element, 'clientHeight', {
      configurable: true,
      value: 100,
    });
    element.scrollTop = 40;

    await wrapper.get('.project-log-viewer-output').trigger('scroll');
    expect(wrapper.text()).toContain('Voltar ao final');

    await wrapper.get('.project-log-viewer-follow').trigger('click');
    expect(element.scrollTop).toBe(300);
    expect(wrapper.text()).toContain('Acompanhando o final');
  });
});
