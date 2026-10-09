import type { TextStyle } from 'react-native';

// Seam's look: near-black, warm ivory type, one champagne accent used
// sparingly. Display type is Instrument Serif; UI type is Inter.

export const C = {
  bg: '#0A0A0A',
  surface: '#141414',
  surfaceHi: '#1D1D1D',
  line: '#2A2A2A',
  lineSoft: '#1F1F1F',
  text: '#F2EFE9',
  textDim: '#8E8B85',
  textFaint: '#5C5A56',
  accent: '#D9C29C',
  accentInk: '#16120B',
  danger: '#E5484D',
  seam: '#D9C29C',
} as const;

export const R = { sm: 10, md: 16, lg: 24, pill: 999 } as const;

export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const T = {
  display: { fontFamily: 'InstrumentSerif_400Regular', color: C.text } satisfies TextStyle,
  displayItalic: { fontFamily: 'InstrumentSerif_400Regular_Italic', color: C.text } satisfies TextStyle,
  body: { fontFamily: 'Inter_400Regular', color: C.text } satisfies TextStyle,
  medium: { fontFamily: 'Inter_500Medium', color: C.text } satisfies TextStyle,
  semibold: { fontFamily: 'Inter_600SemiBold', color: C.text } satisfies TextStyle,
  bold: { fontFamily: 'Inter_700Bold', color: C.text } satisfies TextStyle,
};

export const PALETTE = [
  '#FFFFFF',
  '#F2EFE9',
  '#E8DDCB',
  '#CDBA9A',
  '#9C8B73',
  '#0A0A0A',
  '#2B2A28',
  '#5B5650',
  '#D9C29C',
  '#C8553D',
  '#E07A5F',
  '#F2CC8F',
  '#81B29A',
  '#3D5A80',
  '#98C1D9',
  '#6D597A',
  '#B56576',
  '#E5989B',
  '#264653',
  '#2A9D8F',
];

export const GRADIENTS: [string, string][] = [
  ['#F2EFE9', '#E8DDCB'],
  ['#E8DDCB', '#CDBA9A'],
  ['#1A1A1A', '#3A3631'],
  ['#0F2027', '#2C5364'],
  ['#F6D5C4', '#E07A5F'],
  ['#E5989B', '#6D597A'],
  ['#98C1D9', '#3D5A80'],
  ['#F2CC8F', '#81B29A'],
  ['#D9C29C', '#5B5650'],
  ['#FFFFFF', '#98C1D9'],
];
