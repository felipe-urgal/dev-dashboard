import type { App } from 'vue';

export const mountedApps = new Map<HTMLElement, App<Element>>();
