import type {
  AiProviderId,
  ProjectAiProviderStatus,
  ProjectAiProvidersStatus,
} from '@dev-dashboard/contracts';
import type { ProjectAiConsentRepository } from '@dev-dashboard/core';

import type { AiAssistantService } from './ai-assistant-service.js';

const DEFAULT_AI_PROVIDER: AiProviderId = 'ollama';

interface AiProviderEntry {
  id: AiProviderId;
  label: string;
  kind: 'local' | 'cloud';
  assistantService: AiAssistantService;
}

export type AiProviderResolutionErrorCode =
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_CLOUD_CONSENT_REQUIRED';

export class AiProviderResolutionError extends Error {
  public constructor(
    public readonly code: AiProviderResolutionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AiProviderResolutionError';
  }
}

export interface AiProviderResolverOptions {
  ollama: AiAssistantService;
  openai: AiAssistantService;
  consentRepository: ProjectAiConsentRepository;
}

export class AiProviderResolver {
  private readonly providers: Record<AiProviderId, AiProviderEntry>;

  public constructor(private readonly options: AiProviderResolverOptions) {
    this.providers = {
      ollama: {
        id: 'ollama',
        label: 'Local',
        kind: 'local',
        assistantService: options.ollama,
      },
      openai: {
        id: 'openai',
        label: 'OpenAI',
        kind: 'cloud',
        assistantService: options.openai,
      },
    };
  }

  public async status(projectId: string): Promise<ProjectAiProvidersStatus> {
    const providers = await Promise.all(
      (Object.keys(this.providers) as AiProviderId[]).map((providerId) =>
        this.providerStatus(projectId, providerId),
      ),
    );
    return { defaultProvider: DEFAULT_AI_PROVIDER, providers };
  }

  public async resolve(
    projectId: string,
    providerId: AiProviderId = DEFAULT_AI_PROVIDER,
  ): Promise<AiAssistantService> {
    const entry = this.providers[providerId];
    if (entry.kind === 'cloud' && !this.hasCloudConsent(projectId, providerId)) {
      throw new AiProviderResolutionError(
        'AI_CLOUD_CONSENT_REQUIRED',
        'Autorize o uso da OpenAI para este projeto antes de enviar código à cloud.',
      );
    }

    const status = await entry.assistantService.status();
    if (!status.available) {
      throw new AiProviderResolutionError(
        'AI_PROVIDER_UNAVAILABLE',
        status.message || 'O provider de IA selecionado não está disponível.',
      );
    }
    return entry.assistantService;
  }

  public async setCloudConsent(
    projectId: string,
    providerId: AiProviderId,
    granted: boolean,
  ): Promise<void> {
    if (providerId !== 'openai') {
      throw new AiProviderResolutionError(
        'AI_PROVIDER_UNAVAILABLE',
        'Consentimento explícito só é necessário para providers cloud.',
      );
    }
    await this.options.consentRepository.set(projectId, providerId, granted);
  }

  private async providerStatus(
    projectId: string,
    providerId: AiProviderId,
  ): Promise<ProjectAiProviderStatus> {
    const entry = this.providers[providerId];
    const status = await entry.assistantService.status();
    const consentRequired = entry.kind === 'cloud';
    return {
      ...status,
      id: entry.id,
      label: entry.label,
      kind: entry.kind,
      consentRequired,
      consentGranted:
        !consentRequired || this.hasCloudConsent(projectId, providerId),
    };
  }

  private hasCloudConsent(projectId: string, providerId: AiProviderId): boolean {
    return (
      providerId === 'openai' &&
      this.options.consentRepository.has(projectId, providerId)
    );
  }
}
