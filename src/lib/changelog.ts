import type { IconName } from '@/components/ui';

// What's New, newest first. `id` marks what the user has seen; bump it with
// each release so the profile shows the "New" badge again.

export type ChangeItem = { icon: IconName; title: string; detail: string };
export type Release = { id: string; version: string; date: string; title: string; items: ChangeItem[] };

export const CHANGELOG: Release[] = [
  {
    id: '2026-10-plan-post',
    version: '1.0.0',
    date: 'October 2026',
    title: 'Plan it, post it',
    items: [
      {
        icon: { ios: 'bell.badge', android: 'notifications' },
        title: 'Schedule and reminders',
        detail: 'Give planned posts a time and Seam reminds you when it’s time to post. Mark them posted and they join your grid.',
      },
      {
        icon: { ios: 'hand.draw', android: 'drag_pan' },
        title: 'Drag to reorder',
        detail: 'Press and hold a post in the grid planner and drop it where it should go.',
      },
      {
        icon: { ios: 'square.grid.3x3.square', android: 'grid_view' },
        title: 'Grid cover carousels',
        detail: 'Turn any tile of a grid puzzle into the first slide of a carousel: the puzzle stays whole, and tapping it opens more.',
      },
      {
        icon: { ios: 'photo.stack', android: 'photo_library' },
        title: 'Start from photos',
        detail: 'Pick your photos first and see the templates that fit, already filled, with faces kept off the seams.',
      },
      {
        icon: { ios: 'text.bubble', android: 'chat' },
        title: 'Captions, hashtags and alt text',
        detail: 'Written on your iPhone, with Apple Intelligence where it’s available. Nothing leaves your phone.',
      },
      {
        icon: { ios: 'music.note', android: 'music_note' },
        title: 'Motion Reels',
        detail: 'Add a song and a gentle zoom to swipe videos, time the swipes to the beat, and export grid puzzles as a reveal reel.',
      },
      {
        icon: { ios: 'shuffle', android: 'shuffle' },
        title: 'Shuffle, end cards and more',
        detail: 'Shuffle a design through new colourways, add a brand end card, save any carousel as a template, keep several brand kits, and add hand-drawn doodles from Shapes.',
      },
    ],
  },
  {
    id: '2026-10-brand-grid',
    version: '1.0.0',
    date: 'October 2026',
    title: 'Your brand, your grid',
    items: [
      {
        icon: { ios: 'paintpalette', android: 'palette' },
        title: 'Apply brand kit',
        detail: 'Restyle any carousel with your colours, fonts and handle in one tap, with a few looks to pick from. Or start a template “With my brand”.',
      },
      {
        icon: { ios: 'square.grid.3x3', android: 'grid_on' },
        title: 'Grid puzzles',
        detail: 'One picture split across 3, 6, 9 or 12 posts. Export numbers them in posting order so they line up on your profile.',
      },
      {
        icon: { ios: 'person.crop.square', android: 'account_box' },
        title: 'Grid planner',
        detail: 'See upcoming carousels and puzzles on your profile next to what you’ve already posted, in the order you’ll post them.',
      },
      {
        icon: { ios: 'seal', android: 'verified' },
        title: 'A fuller brand kit',
        detail: 'Your name, handle, website and tagline, brand images, heading and body fonts, and colours pulled straight from your logo.',
      },
    ],
  },
  {
    id: '2026-10-templates-2',
    version: '1.0.0',
    date: 'October 2026',
    title: 'Templates, upgraded',
    items: [
      {
        icon: { ios: 'sparkles.rectangle.stack', android: 'library_add' },
        title: '15 new templates',
        detail:
          'Postcard, Itinerary, Big Type, Contact Sheet, Notebook, Recipe Card, Tips Thread, Home Tour, Mixtape, Birthday, Countdown, Magazine, Gallery Wall, Outfit Notes and Reading List.',
      },
      {
        icon: { ios: 'scribble', android: 'draw' },
        title: 'Paper, film and ink',
        detail: 'Textured paper, film and stamp frames, photo looks that apply to your own pictures, and hand-drawn doodles you can recolour, move or delete.',
      },
      {
        icon: { ios: 'arrow.left.and.right', android: 'swipe' },
        title: 'Made to be swiped',
        detail: 'More designs run photos, routes and type across the seams, so the carousel reads as one picture.',
      },
      {
        icon: { ios: 'photo.stack', android: 'photo_library' },
        title: 'Real photos in previews',
        detail: 'Every template previews with photography by 29 Unsplash photographers, all credited in Acknowledgements.',
      },
    ],
  },
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
