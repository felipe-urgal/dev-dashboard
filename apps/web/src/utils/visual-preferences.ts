export const THEMES = ['dark', 'light'] as const;

export type Theme = (typeof THEMES)[number];

export interface VisualPreferences {
  theme: Theme;
}

const THEME_KEY = 'dev-dashboard:theme';

export const DEFAULT_VISUAL_PREFERENCES: VisualPreferences = {
  theme: 'dark',
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

  return {
    theme: THEMES.includes(theme as Theme)
      ? (theme as Theme)
      : DEFAULT_VISUAL_PREFERENCES.theme,
  };
}

export function applyVisualPreferences(
  preferences: VisualPreferences,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = preferences.theme;
}

export function saveVisualPreferences(
  preferences: VisualPreferences,
  storage?: Storage,
): void {
  if (storage) {
    try {
      storage.setItem(THEME_KEY, preferences.theme);
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
