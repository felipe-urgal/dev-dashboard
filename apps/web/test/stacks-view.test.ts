import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const webRoot = process.cwd();
const routerSource = readFileSync(
  resolve(webRoot, 'src/router/index.ts'),
  'utf8',
);
const appSource = readFileSync(resolve(webRoot, 'src/App.vue'), 'utf8');
const viewSource = readFileSync(
  resolve(webRoot, 'src/views/StacksView.vue'),
  'utf8',
);
const apiSource = readFileSync(resolve(webRoot, 'src/api/stacks.ts'), 'utf8');
const editorSource = readFileSync(
  resolve(webRoot, 'src/components/StackDefinitionEditor.vue'),
  'utf8',
);
const paletteSource = readFileSync(
  resolve(webRoot, 'src/command-palette-navigation.ts'),
  'utf8',
);
const activityViewSource = readFileSync(
  resolve(webRoot, 'src/views/ActivityView.vue'),
  'utf8',
);
const resourceRegistrySource = readFileSync(
  resolve(webRoot, 'src/utils/activity-resources.ts'),
  'utf8',
);

describe('Stacks multi-projeto', () => {
  it('expõe Stacks como página global', () => {
    expect(routerSource).toMatch(
      /path: '\/stacks'[\s\S]*?name: 'stacks'[\s\S]*?StacksView\.vue/,
    );
    expect(appSource).toContain('<span class="navigation-text">Stacks</span>');
    expect(paletteSource).toContain("id: 'page-stacks'");
    expect(paletteSource).toContain("to: { name: 'stacks' }");
  });

  it('usa somente a API estruturada de Stacks', () => {
    expect(apiSource).toContain("'/api/stacks'");
    expect(apiSource).toContain("'/check'");
    expect(apiSource).toContain("'/dependency-suggestions'");
    expect(apiSource).toContain("'/logs'");
    expect(apiSource).toContain("method: 'PUT'");
    expect(apiSource).toContain("'/start'");
    expect(apiSource).toContain("'/stop'");
    expect(apiSource).toContain('/restart');
    expect(apiSource).not.toContain('path');
    expect(apiSource).not.toContain('argv');
    expect(apiSource).not.toContain('command');
  });

  it('cria Stacks sem definição prévia e edita nodes/arestas por catálogo backend', () => {
    expect(viewSource).toContain('fetchStackResources');
    expect(viewSource).toContain('async function submitCreate(');
    expect(viewSource).toContain('await saveStack(definition)');
    expect(viewSource).toContain('async function submitEdit(');
    expect(viewSource).toContain('editingRevision.value');
    expect(viewSource).toContain('StackDefinitionEditor');
    expect(editorSource).toContain('props.resources[index]');
    expect(editorSource).toContain('dependencies.value.push');
    expect(editorSource).toContain('removeNode(');
    expect(editorSource).not.toContain('command:');
    expect(editorSource).not.toContain('argv:');
    expect(editorSource).not.toContain('path:');
    expect(apiSource).toContain("'/api/stacks/resources'");
  });

  it('navega para o domínio responsável sem inferir process kind', () => {
    expect(viewSource).toContain("name: 'project-compose'");
    expect(viewSource).toContain("name: 'project-server'");
    expect(viewSource).toContain("name: 'project-details'");
    expect(viewSource).toContain('environmentInstanceId');
    expect(viewSource).toContain('Abrir Compose');
    expect(viewSource).toContain('Abrir servidor');
    expect(viewSource).toContain('Abrir projeto');
    expect(viewSource).not.toContain('processId.includes');
    expect(viewSource).not.toContain('processId.startsWith');
  });

  it('exige confirmação explícita antes de parar e mostra impacto por node', () => {
    expect(viewSource).toContain('@click="confirmStop(stack)"');
    expect(viewSource).toContain('function confirmStop(stack: Stack)');
    expect(viewSource).toContain('check.topology.stopOrder');
    expect(viewSource).toContain('JSON.stringify(check.stack)');
    expect(viewSource).toContain(
      'const confirmedRevision = expectedRevision(stack.id)',
    );
    expect(viewSource).toContain('stopStack(stack.id, confirmedRevision)');
    expect(viewSource).toContain("node.target.kind === 'environment'");
    expect(viewSource).toContain("node.target.kind === 'health-check'");
    expect(viewSource).toContain('await confirmDialog({');
    expect(viewSource).toContain(
      'Atualize a Stack antes de confirmar a parada',
    );
  });

  it('permite remover dependência explicitamente sem auto-save', () => {
    expect(viewSource).toContain('async function removeDependency(');
    expect(viewSource).toContain('dependencies: stack.dependencies.filter');
    expect(viewSource).toMatch(
      /@click="\s*removeDependency\(\s*stack,\s*dependency\.nodeId,\s*dependency\.dependsOnNodeId,\s*\)\s*"/,
    );
    expect(viewSource).toContain('Dependências confirmadas:');
    expect(viewSource).toContain('Remover dependência de');
  });

  it('preserva resultados por node sem confundir operação com Check ou prévia', () => {
    expect(viewSource).toContain('const outcomes = ref(');
    expect(viewSource).toContain(
      'outcomes.value = new Map(outcomes.value).set',
    );
    expect(viewSource).toContain('outcomeSteps(outcomeFor(stack.id)!)');
    expect(viewSource).toContain('Resultado retornado pela operação');
    expect(viewSource).toContain(
      'Os demais nodes podem não ter sido executados',
    );
    expect(viewSource).toContain(
      'response.revisions[id] === revisions.value[id]',
    );
    expect(viewSource).toContain('nextOutcomes.delete(stackId)');
    expect(viewSource).toContain('setCheck(result.check)');
  });

  it('integra eventos de Stack à Timeline global', () => {
    expect(activityViewSource).toContain('resolveActivityResource(event)');
    expect(resourceRegistrySource).toContain("'stack-node'");
    expect(resourceRegistrySource).toContain("name: 'stacks'");
    expect(resourceRegistrySource).toContain('Abrir Stacks');
  });

  it('mostra topologia, estado e lifecycle suportado sem inventar mutações', () => {
    expect(viewSource).toContain('Ordem topológica');
    expect(viewSource).toContain("target.kind === 'compose-service'");
    expect(viewSource).toContain('Iniciar');
    expect(viewSource).toContain('Parar');
    expect(viewSource).toContain('Reiniciar');
    expect(viewSource).toContain('canRestart(node)');
    expect(viewSource).toContain('Sugestões de dependência');
    expect(viewSource).toContain('Logs agregados da Stack');
    expect(viewSource).toContain('Ver logs');
    expect(viewSource).toContain('fetchStackLogs');
    expect(viewSource).toContain('logSourceLabel(nodeLog.source)');
    expect(viewSource).toContain("source === 'compose'");
    expect(viewSource).toContain("source === 'process'");
    expect(viewSource).toMatch(/Nada é salvo\s+automaticamente\./);
    expect(viewSource).toContain('suggestion.evidence.service');
    expect(viewSource).toContain(
      '@click="acceptSuggestion(stack, suggestion)"',
    );
    expect(viewSource).toContain('Criar Stack a partir desta');
    expect(viewSource).toContain('await saveStack(copy)');
    expect(viewSource).toContain('crypto.randomUUID()');
    expect(viewSource).toContain('Editar Stack');
    expect(viewSource).toContain('Excluir Stack');
    expect(viewSource).toContain('await confirmDialog({');
    expect(viewSource).toContain('await deleteStack(stack.id, revision)');
    expect(viewSource).toContain('expectedRevision(stack.id)');
    expect(apiSource).toContain("method: 'DELETE'");
  });
});
