import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import DeploymentLogViewer from '../src/components/DeploymentLogViewer.vue';

function deploymentLog(content: string) {
  return {
    deploymentId: 'deployment-1',
    content,
    truncated: false,
    masked: false,
    redactionCount: 0,
  };
}

async function flushRendering(): Promise<void> {
  await nextTick();
  await nextTick();
}

describe('DeploymentLogViewer', () => {
  it('remove sequências ANSI antes de exibir o log', () => {
    const wrapper = mount(DeploymentLogViewer, {
      props: {
        log: deploymentLog('\u001b[1m\u001b[32m✓\u001b[39m\u001b[22m teste concluído'),
        open: true,
      },
    });

    expect(wrapper.get('pre').text()).toBe('✓ teste concluído');
    expect(wrapper.get('pre').text()).not.toContain('\u001b[');
    wrapper.unmount();
  });

  it('acompanha o final enquanto o usuário permanece próximo do fim', async () => {
    const wrapper = mount(DeploymentLogViewer, {
      props: {
        log: deploymentLog('linha 1'),
        active: true,
        open: true,
      },
    });
    await flushRendering();

    const output = wrapper.get('pre');
    const element = output.element as HTMLElement;
    let scrollHeight = 300;

    Object.defineProperty(element, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    });
    Object.defineProperty(element, 'clientHeight', {
      configurable: true,
      get: () => 100,
    });

    element.scrollTop = 200;
    await output.trigger('scroll');
    scrollHeight = 360;
    await wrapper.setProps({ log: deploymentLog('linha 1\nlinha 2') });
    await flushRendering();

    expect(element.scrollTop).toBe(360);
    expect(wrapper.text()).toContain('Acompanhando o final');
    wrapper.unmount();
  });

  it('pausa o auto-follow quando o usuário sobe e retoma ao voltar ao final', async () => {
    const wrapper = mount(DeploymentLogViewer, {
      props: {
        log: deploymentLog('linha 1\nlinha 2'),
        active: true,
        open: true,
      },
    });
    await flushRendering();

    const output = wrapper.get('pre');
    const element = output.element as HTMLElement;
    let scrollHeight = 300;

    Object.defineProperty(element, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    });
    Object.defineProperty(element, 'clientHeight', {
      configurable: true,
      get: () => 100,
    });

    element.scrollTop = 40;
    await output.trigger('scroll');
    scrollHeight = 400;
    await wrapper.setProps({
      log: deploymentLog('linha 1\nlinha 2\nlinha 3'),
    });
    await flushRendering();

    expect(element.scrollTop).toBe(40);
    expect(wrapper.text()).toContain('Voltar ao final');

    await wrapper.get('.deployment-log-follow').trigger('click');
    await flushRendering();

    expect(element.scrollTop).toBe(400);
    expect(wrapper.text()).toContain('Acompanhando o final');
    wrapper.unmount();
  });
});
