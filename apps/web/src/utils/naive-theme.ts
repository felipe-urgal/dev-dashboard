import type { GlobalThemeOverrides } from 'naive-ui';
import type { Theme } from './visual-preferences';

/**
 * Mapeia os componentes da Naive UI para os tokens visuais do app, mantendo
 * valores de cor literais para que o parser interno da biblioteca consiga
 * calcular rgba e estados hover/pressed.
 */
const palettes = {
  dark: {
    accent: '#58a6ff',
    accentStrong: '#2f81f7',
    info: '#58a6ff',
    success: '#3fb950',
    warning: '#d29922',
    danger: '#f85149',
    text: '#f0f6fc',
    textMuted: '#b4bdca',
    textDim: '#99a4b4',
    surface0: '#1f2430',
    surface1: '#272d3a',
    surface2: '#313847',
    surface3: '#3d4556',
    border: '#3f4757',
    borderStrong: '#5a6578',
  },
  light: {
    accent: '#058ca4',
    accentStrong: '#00758c',
    info: '#087b91',
    success: '#16734d',
    warning: '#8f6b06',
    danger: '#a32d42',
    text: '#102332',
    textMuted: '#5b7280',
    textDim: '#5f697d',
    surface0: '#f5f8fa',
    surface1: '#ffffff',
    surface2: '#edf3f6',
    surface3: '#e0ebef',
    border: '#d4e1e7',
    borderStrong: '#aac5d0',
  },
} as const;

/**
 * Naive UI parses several color overrides with `rgba()`. CSS variables are
 * valid CSS, but are not valid input for that parser and crash components such
 * as NSwitch when the workspace modal renders an existing workspace.
 */
export function createNaiveThemeOverrides(theme: Theme): GlobalThemeOverrides {
  const colors = palettes[theme];

  return {
    common: {
      primaryColor: colors.accentStrong,
      primaryColorHover: colors.accent,
      primaryColorPressed: colors.accentStrong,
      primaryColorSuppl: colors.accent,
      infoColor: colors.info,
      infoColorHover: colors.info,
      infoColorPressed: colors.info,
      successColor: colors.success,
      successColorHover: colors.success,
      successColorPressed: colors.success,
      warningColor: colors.warning,
      warningColorHover: colors.warning,
      warningColorPressed: colors.warning,
      errorColor: colors.danger,
      errorColorHover: colors.danger,
      errorColorPressed: colors.danger,
      textColorBase: colors.text,
      textColor1: colors.text,
      textColor2: colors.text,
      textColor3: colors.textMuted,
      textColorDisabled: colors.textDim,
      placeholderColor: colors.textDim,
      placeholderColorDisabled: colors.textDim,
      iconColor: colors.textDim,
      iconColorHover: colors.textMuted,
      iconColorPressed: colors.textMuted,
      iconColorDisabled: colors.textDim,
      borderColor: colors.border,
      dividerColor: colors.border,
      popoverColor: colors.surface1,
      cardColor: colors.surface1,
      modalColor: colors.surface1,
      bodyColor: colors.surface0,
      tableColor: colors.surface1,
      hoverColor: colors.surface2,
      pressedColor: colors.surface3,
      inputColor: colors.surface2,
      closeIconColor: colors.textDim,
      closeIconColorHover: colors.text,
      closeIconColorPressed: colors.text,
      closeColorHover: colors.surface2,
      closeColorPressed: colors.surface3,
      scrollbarColor: colors.borderStrong,
      scrollbarColorHover: colors.textDim,
      borderRadius: '6px',
      fontFamily: 'system-ui, sans-serif',
    },
    // O padrão (20px 26px 0 0 sobre top: 16px) deixava o X abaixo do título.
    Dialog: { borderRadius: '14px', closeMargin: '-2px 16px 0 0' },
    Modal: { borderRadius: '14px' },
    Card: { borderRadius: '14px' },
    Dropdown: { borderRadius: '10px' },
    Popover: { borderRadius: '10px' },
    Switch: {
      railColor: colors.surface3,
      railColorActive: colors.accentStrong,
      buttonColor: colors.text,
    },
  };
}

export const naiveThemeOverrides = createNaiveThemeOverrides('dark');
