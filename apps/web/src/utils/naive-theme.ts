import type { GlobalThemeOverrides } from 'naive-ui';
import type { Theme } from './visual-preferences';

/**
 * Mapeia os componentes da Naive UI para os tokens visuais do app, mantendo
 * valores de cor literais para que o parser interno da biblioteca consiga
 * calcular rgba e estados hover/pressed.
 */
const palettes = {
  dark: {
    accent: '#32d6ee',
    accentStrong: '#00b9d4',
    info: '#5bdff1',
    success: '#45e39b',
    warning: '#f3c94f',
    danger: '#ff7181',
    text: '#e8f5fb',
    textMuted: '#8ba6b7',
    textDim: '#7ea6b8',
    surface0: '#020b14',
    surface1: '#061522',
    surface2: '#0b1d2d',
    surface3: '#10283b',
    border: '#17334a',
    borderStrong: '#24506a',
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
    Dialog: { borderRadius: '14px' },
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
