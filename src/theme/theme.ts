import { MD3DarkTheme, type MD3Theme } from 'react-native-paper';

/**
 * Material 3 dark theme with a cyan-blue ("青蓝") primary and a deep
 * purple-grey background. Cover-first visual language: minimal chrome,
 * soft rounded surfaces, generous whitespace.
 */
export const theme: MD3Theme = {
  ...MD3DarkTheme,
  roundness: 3,
  colors: {
    ...MD3DarkTheme.colors,
    // 青蓝 primary
    primary: '#7FD4E2',
    onPrimary: '#00363D',
    primaryContainer: '#004F59',
    onPrimaryContainer: '#9EF0FA',
    secondary: '#B0CBD1',
    onSecondary: '#1B3438',
    secondaryContainer: '#324A50',
    onSecondaryContainer: '#CCE7ED',
    tertiary: '#BFC6DE',
    onTertiary: '#293043',
    tertiaryContainer: '#3F4659',
    onTertiaryContainer: '#DBE1F9',
    // 保留深紫灰背景
    background: '#141218',
    onBackground: '#E6E0E9',
    surface: '#141218',
    onSurface: '#E6E0E9',
    surfaceVariant: '#3E484C',
    onSurfaceVariant: '#BEC8CB',
    outline: '#889296',
    outlineVariant: '#3E484C',
    inversePrimary: '#00697A',
  },
};

/** Pastel accent palette used for tag groups and info labels. */
export const TAG_COLORS = [
  '#7FD4E2',
  '#B7A6F0',
  '#F2A6C0',
  '#9FD9AF',
  '#F2C48A',
  '#8FB8F0',
  '#D9A6E6',
  '#8FD9C8',
  '#E6EE9C',
  '#F48FB1',
  '#B39DDB',
  '#9FA8DA',
];
