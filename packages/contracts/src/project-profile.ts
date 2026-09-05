export type DetectionConfidence = 'certain' | 'strong' | 'weak';
export type DetectionEvidenceKind = 'file' | 'manifest' | 'config';

export interface DetectionEvidence {
  kind: DetectionEvidenceKind;
  source: string;
  detail?: string;
}

export interface DetectedCapability {
  id: string;
  provider: string;
  confidence: DetectionConfidence;
  evidence: DetectionEvidence[];
  metadata?: Record<string, string | number | boolean | null | string[]>;
}

export interface ProjectProfileDiagnostic {
  provider: string;
  message: string;
}

export interface ProjectProfile {
  capabilities: DetectedCapability[];
  diagnostics: ProjectProfileDiagnostic[];
}

export interface ProjectProfileProviderContext {
  projectPath: string;
  projectType: 'rails' | 'node' | 'unknown';
}

export interface ProjectProfileProvider {
  id: string;
  detect(context: ProjectProfileProviderContext): Promise<DetectedCapability[]>;
}
