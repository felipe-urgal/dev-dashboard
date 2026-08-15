import type { GlobalThemeOverrides } from 'naive-ui';

/**
 * Mapeia os componentes da Naive UI para os tokens de `styles/tokens.css`,
 * em vez de duplicar cores por tema — as strings `var(--...)` já trocam
 * sozinhas entre claro/escuro junto com o resto do app.
 */
export const naiveThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: 'var(--accent-strong)',
    primaryColorHover: 'var(--accent)',
    primaryColorPressed: 'var(--accent-strong)',
    primaryColorSuppl: 'var(--accent)',
    infoColor: 'var(--info-text)',
    infoColorHover: 'var(--info-text)',
    infoColorPressed: 'var(--info-text)',
    successColor: 'var(--success-text)',
    successColorHover: 'var(--success-text)',
    successColorPressed: 'var(--success-text)',
    warningColor: 'var(--warning-text)',
    warningColorHover: 'var(--warning-text)',
    warningColorPressed: 'var(--warning-text)',
    errorColor: 'var(--danger-text)',
    errorColorHover: 'var(--danger-text)',
    errorColorPressed: 'var(--danger-text)',
    textColorBase: 'var(--text)',
    textColor1: 'var(--text)',
    textColor2: 'var(--text)',
    textColor3: 'var(--text-muted)',
    textColorDisabled: 'var(--text-dim)',
    placeholderColor: 'var(--text-dim)',
    placeholderColorDisabled: 'var(--text-dim)',
    iconColor: 'var(--text-dim)',
    iconColorHover: 'var(--text-muted)',
    iconColorPressed: 'var(--text-muted)',
    iconColorDisabled: 'var(--text-dim)',
    borderColor: 'var(--border)',
    dividerColor: 'var(--border)',
    popoverColor: 'var(--surface-1)',
    cardColor: 'var(--surface-1)',
    modalColor: 'var(--surface-1)',
    bodyColor: 'var(--surface-0)',
    tableColor: 'var(--surface-1)',
    hoverColor: 'var(--surface-2)',
    pressedColor: 'var(--surface-3)',
    inputColor: 'var(--surface-2)',
    closeIconColor: 'var(--text-dim)',
    closeIconColorHover: 'var(--text)',
    closeIconColorPressed: 'var(--text)',
    closeColorHover: 'var(--surface-2)',
    closeColorPressed: 'var(--surface-3)',
    scrollbarColor: 'var(--border-strong)',
    scrollbarColorHover: 'var(--text-dim)',
    borderRadius: 'var(--radius-sm)',
    fontFamily: 'var(--font-family)',
  },
  Dialog: {
    borderRadius: 'var(--radius-lg)',
  },
  Modal: {
    borderRadius: 'var(--radius-lg)',
  },
  Card: {
    borderRadius: 'var(--radius-lg)',
  },
  Dropdown: {
    borderRadius: 'var(--radius-md)',
  },
  Popover: {
    borderRadius: 'var(--radius-md)',
  },
  Switch: {
    railColor: 'var(--surface-3)',
    railColorActive: 'var(--accent-strong)',
    buttonColor: 'var(--text)',
  },
};
