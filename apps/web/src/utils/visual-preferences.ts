export const THEMES = ['dark', 'light'] as const;
export const DENSITIES = ['comfortable', 'compact'] as const;

export type Theme = (typeof THEMES)[number];
export type Density = (typeof DENSITIES)[number];

export interface VisualPreferences {
  theme: Theme;
  density: Density;
}

const THEME_KEY = 'dev-dashboard:theme';
const DENSITY_KEY = 'dev-dashboard:density';

export const DEFAULT_VISUAL_PREFERENCES: VisualPreferences = {
  theme: 'dark',
  density: 'comfortable',
};

function storedValue(storage: Storage | undefined, key: string): string | null {
  if (!storage) return null;

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function readVisualPreferences(storage?: Storage): VisualPreferences {
  const theme = storedValue(storage, THEME_KEY);
  const density = storedValue(storage, DENSITY_KEY);

  return {
    theme: THEMES.includes(theme as Theme) ? theme as Theme : DEFAULT_VISUAL_PREFERENCES.theme,
    density: DENSITIES.includes(density as Density) ? density as Density : DEFAULT_VISUAL_PREFERENCES.density,
  };
}

export function applyVisualPreferences(
  preferences: VisualPreferences,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = preferences.theme;
  root.dataset.density = preferences.density;
}

export function saveVisualPreferences(
  preferences: VisualPreferences,
  storage?: Storage,
): void {
  if (storage) {
    try {
      storage.setItem(THEME_KEY, preferences.theme);
      storage.setItem(DENSITY_KEY, preferences.density);
    } catch {
      // A preferência continua aplicada durante a sessão quando a persistência está indisponível.
    }
  }

  applyVisualPreferences(preferences);
}

export function loadVisualPreferences(): VisualPreferences {
  const preferences = readVisualPreferences(
    typeof localStorage === 'undefined' ? undefined : localStorage,
  );
  applyVisualPreferences(preferences);
  return preferences;
}
