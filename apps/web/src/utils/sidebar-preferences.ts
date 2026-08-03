export const SIDEBAR_COLLAPSED_STORAGE_KEY =
  'dev-dashboard:primary-sidebar-collapsed';

interface ReadableStorage {
  getItem(key: string): string | null;
}

interface WritableStorage {
  setItem(key: string, value: string): void;
}

export function readSidebarCollapsed(
  storage: ReadableStorage = window.localStorage,
): boolean {
  try {
    return storage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function storeSidebarCollapsed(
  collapsed: boolean,
  storage: WritableStorage = window.localStorage,
): void {
  try {
    storage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // A preferência é opcional; o layout continua funcional sem localStorage.
  }
}
