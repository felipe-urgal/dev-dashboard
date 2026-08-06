/**
 * Categorias reconhecidas pelo classificador de impacto, cada uma mapeada
 * para uma área do dashboard que já existe (rota com o mesmo nome).
 */
export type ProjectChangeImpactCategory =
  'dependencies' | 'database' | 'environment' | 'server' | 'tests';

export interface ProjectChangeImpactAction {
  category: ProjectChangeImpactCategory;
  label: string;
  description: string;
  /** Nome da rota do frontend para o deep link, quando a área correspondente já existir. */
  routeName?: string;
  /** Caminhos (relativos ao projeto) que geraram esta recomendação. */
  matchedPaths: string[];
}

export interface ProjectChangeImpact {
  previousSha: string;
  currentSha: string;
  changedPaths: string[];
  actions: ProjectChangeImpactAction[];
}
