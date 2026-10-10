import type { IconName } from '@/components/ui';

// What's New, newest first. `id` marks what the user has seen; bump it with
// each release so the profile shows the "New" badge again.

export type ChangeItem = { icon: IconName; title: string; detail: string };
export type Release = { id: string; version: string; date: string; title: string; items: ChangeItem[] };

export const CHANGELOG: Release[] = [
  {
    id: '2026-10-profile',
    version: '1.0.0',
    date: 'October 2026',
    title: 'Your space',
    items: [
      {
        icon: { ios: 'dock.rectangle', android: 'dock_to_bottom' },
        title: 'The Seam dock',
        detail: 'Your tabs are slides of one picture, and the active tab is a window that swipes across it. The empty slide at the end deals a hand of blank slides: tap a shape to start.',
      },
      {
        icon: { ios: 'paintpalette', android: 'palette' },
        title: 'Brand kit',
        detail: 'Keep your colours, logos and fonts together. Logos drop onto the canvas from Shapes → Brand.',
      },
      {
        icon: { ios: 'gearshape', android: 'settings' },
        title: 'Settings',
        detail: 'Default ratio and slide count, export format, snapping, and tools to clear the cache or tidy unused media.',
      },
      {
        icon: { ios: 'photo.stack', android: 'photo_library' },
        title: 'Real photos in previews',
        detail: 'Templates now preview with photography by 20 Unsplash photographers, and every one of them is credited in Acknowledgements.',
      },
    ],
  },
  {
    id: '2026-10-templates',
    version: '1.0.0',
    date: 'October 2026',
    title: 'Templates that look finished',
    items: [
      {
        icon: { ios: 'photo.on.rectangle', android: 'photo_library' },
        title: 'Sample photos in every preview',
        detail: 'See a template the way it will look, then fill the frames with your own.',
      },
      {
        icon: { ios: 'magnifyingglass', android: 'search' },
        title: 'Search, collections and favourites',
        detail: 'Find templates by name or mood, browse editorial collections, and heart the ones you love.',
      },
      {
        icon: { ios: 'square.grid.2x2', android: 'grid_view' },
        title: 'Slide overview and layouts',
        detail: 'See every slide at once, drag to reorder, and add slides from 12 layouts or 18 grids.',
      },
      {
        icon: { ios: 'scribble.variable', android: 'draw' },
        title: 'Draw, textures and frames',
        detail: 'Freehand drawing, paper and film textures, and taped, film and stamp frames.',
      },
      {
        icon: { ios: 'link', android: 'link' },
        title: 'Share templates',
        detail: 'Send a design as a link. Your photos stay with you; the layout travels.',
      },
    ],
  },
  {
    id: '2026-10-launch',
    version: '1.0.0',
    date: 'October 2026',
    title: 'Hello, Seam',
    items: [
      {
        icon: { ios: 'rectangle.split.3x1', android: 'view_carousel' },
        title: 'One canvas, many slides',
        detail: 'Photos, video and text flow across every seam of your carousel.',
      },
      {
        icon: { ios: 'person.crop.rectangle', android: 'face' },
        title: 'Cutouts and face-aware seams',
        detail: 'Lift a subject out of a photo, and get warned before a seam cuts through a face.',
      },
      {
        icon: { ios: 'play.rectangle', android: 'movie' },
        title: 'Swipe videos and Reels',
        detail: 'Export a video that swipes through your carousel, at post size or 9:16.',
      },
    ],
  },
];

export const LATEST_NEWS = CHANGELOG[0].id;
