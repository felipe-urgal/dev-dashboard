export interface BundlerOutdatedGem {
  name: string;
  installed: string;
  newest: string;
  requested?: string;
}

export interface BundlerCheckResult {
  satisfied: boolean;
  message: string;
}

export interface BundlerOverview {
  supported: boolean;
  check?: BundlerCheckResult;
  outdated: BundlerOutdatedGem[];
}
