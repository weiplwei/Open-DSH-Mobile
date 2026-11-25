import { Platform } from 'react-native';

export type ThemePalette = {
  background: string;
  backgroundDeep: string;
  surface: string;
  surfaceRaised: string;
  card: string;
  cardPressed: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  muted: string;
  faint: string;
  accent: string;
  accentText: string;
  accentBlue: string;
  accentBluePressed: string;
  accentBlueMuted: string;
  composerBg: string;
  composerBorder: string;
  codeBg: string;
  codeText: string;
  inlineCodeBg: string;
  inlineCodeText: string;
  floatingBg: string;
  green: string;
  amber: string;
  red: string;
  blue: string;
  purple: string;
  userBubble: string;
  code: string;
  overlay: string;
  bg: string;
  primary: string;
  primaryText: string;
  textPrimary: string;
  success: string;
  successMuted: string;
  warning: string;
  danger: string;
  dangerMuted: string;
  input: string;
  selected: string;
};

export const lightColors: ThemePalette = {
  background: '#F7F8FA',
  backgroundDeep: '#EFF1F5',
  surface: '#FFFFFF',
  surfaceRaised: '#F0F2F5',
  card: '#FFFFFF',
  cardPressed: '#EFF1F5',
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',
  text: '#18181B',
  textSecondary: '#52525B',
  muted: '#71717A',
  faint: '#A1A1AA',
  accent: '#18181B',
  accentText: '#FFFFFF',
  accentBlue: '#4F6BF6',
  accentBluePressed: '#3B55E6',
  accentBlueMuted: '#EEF2FF',
  composerBg: '#FFFFFF',
  composerBorder: '#E4E7EC',
  codeBg: '#F1F3F6',
  codeText: '#1F2937',
  inlineCodeBg: '#ECEEF2',
  inlineCodeText: '#B45309',
  floatingBg: '#FFFFFF',
  green: '#16A34A',
  amber: '#D97706',
  red: '#DC2626',
  blue: '#4F6BF6',
  purple: '#7C3AED',
  userBubble: '#EFF1F5',
  code: '#F1F3F6',
  overlay: 'rgba(0,0,0,0.38)',
  bg: '#F7F8FA',
  primary: '#18181B',
  primaryText: '#FFFFFF',
  textPrimary: '#18181B',
  success: '#16A34A',
  successMuted: '#DCFCE7',
  warning: '#D97706',
  danger: '#DC2626',
  dangerMuted: '#FEE2E2',
  input: '#F3F4F6',
  selected: '#EEF2FF',
};

export const darkColors: ThemePalette = {
  background: '#151517',
  backgroundDeep: '#0f0f11',
  surface: '#1d1d20',
  surfaceRaised: '#242427',
  card: '#2d2c31',
  cardPressed: '#38373d',
  border: '#343338',
  borderStrong: '#48474e',
  text: '#f4f3ef',
  textSecondary: '#b5b2ac',
  muted: '#7d7a76',
  faint: '#57555a',
  accent: '#f0efe9',
  accentText: '#171719',
  accentBlue: '#637DFF',
  accentBluePressed: '#4F6BF6',
  accentBlueMuted: '#1E2547',
  composerBg: '#1E1E22',
  composerBorder: '#383840',
  codeBg: '#111114',
  codeText: '#DDD9D2',
  inlineCodeBg: '#27272E',
  inlineCodeText: '#E7C9A9',
  floatingBg: '#26262B',
  green: '#83c9a5',
  amber: '#e7b873',
  red: '#e99393',
  blue: '#93b8d8',
  purple: '#b9a7dc',
  userBubble: '#36353b',
  code: '#111114',
  overlay: 'rgba(0,0,0,0.62)',
  bg: '#151517',
  primary: '#f0efe9',
  primaryText: '#171719',
  textPrimary: '#f4f3ef',
  success: '#83c9a5',
  successMuted: '#20352b',
  warning: '#e7b873',
  danger: '#e99393',
  dangerMuted: '#302225',
  input: '#242427',
  selected: '#38373d',
};

export const colors: ThemePalette = lightColors;

export const radius = { small: 8, medium: 12, large: 18, pill: 999 } as const;
export const radii = { sm: 8, md: 12, lg: 18, pill: 999 } as const;
export const shadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.12,
  shadowRadius: 8,
  elevation: 3,
} as const;
export const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
export const hitSlop = { top: 10, right: 10, bottom: 10, left: 10 } as const;
