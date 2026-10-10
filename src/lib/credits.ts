import type { SceneId } from './samples';

// The people behind what Seam ships. Open-source software and fonts are
// collected by scripts/acknowledgements.mjs; the photos and services are
// listed here by hand.

export type PhotoCredit = { scene: SceneId; title: string; author: string; url: string; picsum: number };

/** The sample photos in assets/samples, found through Lorem Picsum. */
export const PHOTO_CREDITS: PhotoCredit[] = [
  { scene: 'sunset', title: 'Sunset', author: 'Dmitrii Vaccinium', url: 'https://unsplash.com/photos/Q47eNv_UvfM', picsum: 1026 },
  { scene: 'ocean', title: 'Ocean', author: 'Paweł Wojciechowski', url: 'https://unsplash.com/photos/QYAojSRu82c', picsum: 323 },
  { scene: 'lake', title: 'Lake', author: 'Roberto Nickson', url: 'https://unsplash.com/photos/7BjmDICVloE', picsum: 1011 },
  { scene: 'skyline', title: 'Skyline', author: 'Kevin Young', url: 'https://unsplash.com/photos/-icmOdYWXuQ', picsum: 1067 },
  { scene: 'dunes', title: 'Dunes', author: 'Tim de Groot', url: 'https://unsplash.com/photos/yNGQ830uFB4', picsum: 184 },
  { scene: 'forest', title: 'Forest', author: 'Christian Joudrey', url: 'https://unsplash.com/photos/mWRR1xj95hg', picsum: 1043 },
  { scene: 'palms', title: 'Palms', author: 'Florian Klauer', url: 'https://unsplash.com/photos/t1mqA3V3-7g', picsum: 108 },
  { scene: 'stars', title: 'Night sky', author: 'Vashishtha Jogi', url: 'https://unsplash.com/photos/bClr95glx6k', picsum: 1022 },
  { scene: 'bokeh', title: 'City lights', author: 'Matthew Skinner', url: 'https://unsplash.com/photos/t05kfHeygbE', picsum: 195 },
  { scene: 'stilllife', title: 'Still life', author: 'Carli Jean', url: 'https://unsplash.com/photos/UWRqlJcDCXA', picsum: 431 },
  { scene: 'portrait', title: 'Portrait', author: 'Roksolana Zasiadko', url: 'https://unsplash.com/photos/LyeduBb2Auk', picsum: 1027 },
  { scene: 'peaks', title: 'Peaks', author: 'Paul E. Harrer', url: 'https://unsplash.com/photos/TI-B-TNYJMU', picsum: 235 },
  { scene: 'friends', title: 'Friends', author: 'Charlie Foster', url: 'https://unsplash.com/photos/A88emaZe7d8', picsum: 129 },
  { scene: 'concert', title: 'Concert', author: 'Desi Mendoza', url: 'https://unsplash.com/photos/CuSHBGBdXc0', picsum: 452 },
  { scene: 'summer', title: 'Summer', author: 'Alexander Shustov', url: 'https://unsplash.com/photos/AHBiSKaENwc', picsum: 64 },
  { scene: 'street', title: 'Street', author: 'Bonnie Meisels', url: 'https://unsplash.com/photos/Y5uyOoct2pg', picsum: 437 },
  { scene: 'hiker', title: 'Hiker', author: 'Joshua Earle', url: 'https://unsplash.com/photos/YxJ5AfKFgFE', picsum: 447 },
  { scene: 'traveler', title: 'Traveller', author: 'Danielle MacInnes', url: 'https://unsplash.com/photos/1DkWWN1dr-s', picsum: 1001 },
  { scene: 'berries', title: 'Berries', author: 'Glen Carrie', url: 'https://unsplash.com/photos/FjjUVn_KHLU', picsum: 429 },
  { scene: 'camera', title: 'Camera', author: 'Mia Domenico', url: 'https://unsplash.com/photos/1z1F5Qc30Bs', picsum: 454 },
  { scene: 'strawberries', title: 'Strawberries', author: 'veeterzy', url: 'https://unsplash.com/photos/OJJIaFZOeX4', picsum: 1080 },
  { scene: 'cake', title: 'Cake', author: 'Annie Spratt', url: 'https://unsplash.com/photos/R3LcfTvcGWY', picsum: 999 },
  { scene: 'tea', title: 'Tea', author: 'Vee O', url: 'https://unsplash.com/photos/hGO27G5tZJ8', picsum: 225 },
  { scene: 'pourover', title: 'Pour-over', author: 'Karl Fredrickson', url: 'https://unsplash.com/photos/TYIzeCiZ_60', picsum: 1060 },
  { scene: 'cabin', title: 'Cabin', author: 'Alexander Shustov', url: 'https://unsplash.com/photos/OxzhYtL-00Y', picsum: 76 },
  { scene: 'room', title: 'Blue room', author: 'Padurariu Alexandru', url: 'https://unsplash.com/photos/iNmouRApXYM', picsum: 1068 },
  { scene: 'cafe', title: 'Café', author: 'Luke Chesser', url: 'https://unsplash.com/photos/KR2mdHJ5qMg', picsum: 42 },
  { scene: 'vinyl', title: 'Turntable', author: 'Luke Chesser', url: 'https://unsplash.com/photos/pFqrYbhIAXs', picsum: 39 },
  { scene: 'stage', title: 'Stage lights', author: 'Daniel Robert', url: 'https://unsplash.com/photos/MRxD-J9-4ps', picsum: 158 },
  { scene: 'knit', title: 'Knitwear', author: 'Jennifer Trovato', url: 'https://unsplash.com/photos/baRYCsjO6z4', picsum: 91 },
  { scene: 'heels', title: 'Heels', author: 'Alejandro Escamilla', url: 'https://unsplash.com/photos/jVb0mSn0LbE', picsum: 21 },
  { scene: 'book', title: 'Open book', author: 'Alejandro Escamilla', url: 'https://unsplash.com/photos/cZhUxIQjILg', picsum: 24 },
];

export const UNSPLASH_LICENSE = 'https://unsplash.com/license';

export type Credit = { title: string; detail: string; url?: string };

/** Services and platform technology Seam relies on that aren't bundled code. */
export const SERVICES: Credit[] = [
  {
    title: 'Lorem Picsum',
    detail: 'Where the sample photos were found. Created by David Marby and Nijiko Yonskai.',
    url: 'https://picsum.photos',
  },
  {
    title: 'Unsplash',
    detail: 'Home of the photographers above. Their photos are free to use under the Unsplash License.',
    url: 'https://unsplash.com',
  },
  {
    title: 'Google Fonts',
    detail: 'Every typeface in Seam comes from Google Fonts, packaged for Expo by @expo-google-fonts.',
    url: 'https://fonts.google.com',
  },
  {
    title: 'Expo',
    detail: 'The framework, modules and build service Seam is made with.',
    url: 'https://expo.dev',
  },
];

/** System frameworks, credited per platform. */
export const PLATFORM_CREDITS: Record<'ios' | 'android', Credit[]> = {
  ios: [
    {
      title: 'SF Symbols',
      detail: 'The icons on iPhone. SF Symbols are provided by Apple for use in apps on Apple platforms.',
      url: 'https://developer.apple.com/sf-symbols/',
    },
    {
      title: 'Vision, Core Image and AVFoundation',
      detail: 'Apple frameworks behind subject cutouts, face-aware seams, photo labels and video export.',
    },
    {
      title: 'Foundation Models',
      detail: 'Apple’s on-device model, which writes captions and alt text on iPhones with Apple Intelligence.',
    },
  ],
  android: [
    {
      title: 'Material Symbols',
      detail: 'The icons on Android, by Google, under the Apache License 2.0.',
      url: 'https://fonts.google.com/icons',
    },
  ],
};
