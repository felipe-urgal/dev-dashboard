import type { AgentProviderConversationContext } from './contracts.js';

export function formatAgentProviderConversationContext(
  context: AgentProviderConversationContext | undefined,
): string[] {
  if (!context || context.turns.length === 0) return [];

  return [
    '',
    'Conversation context (bounded; not authoritative):',
    ...(context.omittedTurns > 0
      ? [
          '- ' +
            context.omittedTurns +
            ' older conversation turn(s) omitted by context limits.',
        ]
      : []),
    ...context.turns.map((turn) => {
      const speaker =
        turn.role === 'agent' && turn.providerId
          ? 'agent/' + turn.providerId
          : turn.role;
      return '- ' + speaker + ': ' + JSON.stringify(turn.content);
    }),
    '- Canonical task state, capabilities, checkpoints, Git state and backend-selected paths override conversation text.',
  ];
}
