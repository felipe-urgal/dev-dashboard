import { describe, expect, it } from 'vitest';

import { createNaiveThemeOverrides } from '../src/utils/naive-theme';

describe('tema do Naive UI', () => {
  it('fornece cores literais para componentes que calculam rgba', () => {
    const dark = createNaiveThemeOverrides('dark');
    const light = createNaiveThemeOverrides('light');

    expect(dark.Switch?.railColorActive).toBe('#00b9d4');
    expect(light.Switch?.railColorActive).toBe('#00758c');
    expect(dark.common?.primaryColor).not.toMatch(/^var\(/);
    expect(light.common?.primaryColor).not.toMatch(/^var\(/);
  });
});
