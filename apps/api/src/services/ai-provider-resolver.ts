import type {
  AiExecutionMode,
  AiProviderId,
  ProjectAiProviderStatus,
  ProjectAiProvidersStatus,
} from '@dev-dashboard/contracts';
import type {
  ProjectAiConsentRepository,
  ProjectAiSelectionRepository,
} from '@dev-dashboard/core';

import type { AiAssistantService } from './ai-assistant-service.js';

interface AiProviderEntry {
  id: AiProviderId;
  label: string;
  kind: 'local' | 'cloud';
  assistantService: AiAssistantService;
}

export type AiProviderResolutionErrorCode =
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_CLOUD_CONSENT_REQUIRED'
  | 'AI_MODEL_UNAVAILABLE';

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
  selectionRepository: ProjectAiSelectionRepository;
}

export interface ResolvedProjectAiExecution {
  assistantService: AiAssistantService;
  provider: AiProviderId;
  mode: AiExecutionMode;
}

export interface ProjectAiExecutionSelection {
  provider: AiProviderId;
  mode: AiExecutionMode;
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

  public getSelection(projectId: string): ProjectAiExecutionSelection {
    const selection = this.options.selectionRepository.get(projectId);
    return { provider: selection.provider, mode: selection.mode };
  }

  public async status(projectId: string): Promise<ProjectAiProvidersStatus> {
    const selection = this.getSelection(projectId);
    const providers = await Promise.all(
      (Object.keys(this.providers) as AiProviderId[]).map((providerId) =>
        this.providerStatus(projectId, providerId),
      ),
    );
    return {
      selectedProvider: selection.provider,
      selectedMode: selection.mode,
      providers,
    };
  }

  public async resolveSelected(
    projectId: string,
    model?: string,
  ): Promise<ResolvedProjectAiExecution> {
    const selection = this.getSelection(projectId);
    const assistantService = await this.resolve(
      projectId,
      selection.provider,
      model,
    );
    return {
      assistantService,
      provider: selection.provider,
      mode: selection.mode,
    };
  }

  public async resolve(
    projectId: string,
    providerId: AiProviderId,
    model?: string,
  ): Promise<AiAssistantService> {
    const entry = this.providers[providerId];
    if (
      entry.kind === 'cloud' &&
      !this.hasCloudConsent(projectId, providerId)
    ) {
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

    if (model !== undefined) {
      const requestedModel = model.trim();
      const modelAvailable =
        requestedModel.length > 0 &&
        status.models.some((candidate) => candidate.name === requestedModel);
      if (!modelAvailable) {
        throw new AiProviderResolutionError(
          'AI_MODEL_UNAVAILABLE',
          requestedModel
            ? `O modelo "${requestedModel}" não está disponível no provider ${entry.label}. Selecione um modelo listado para este provider.`
            : 'Selecione um modelo de IA disponível para o provider escolhido.',
        );
      }
    }

    return entry.assistantService;
  }

  public async setSelection(
    projectId: string,
    provider: AiProviderId,
    mode: AiExecutionMode,
  ): Promise<void> {
    await this.options.selectionRepository.set(projectId, { provider, mode });
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

  private hasCloudConsent(
    projectId: string,
    providerId: AiProviderId,
  ): boolean {
    return (
      providerId === 'openai' &&
      this.options.consentRepository.has(projectId, providerId)
    );
  }
}
