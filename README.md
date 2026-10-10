# Seam

Carousels without edges. A seamless Instagram carousel maker built with Expo (SDK 57) + React Native Skia. No watermark, no paywall.

## Run

```bash
npm install
npx expo start --ios
```

Runs in Expo Go: every native module used (Skia, image picker, document picker, media library, file system, image manipulator, video thumbnails, glass effect, Expo UI, haptics) ships with it. Three features need the local native modules and therefore a native build (`npx expo run:ios`):

| Feature | Module | In Expo Go |
| --- | --- | --- |
| Video slides as MP4, swipe videos, Reels | `modules/seam-video-export` (AVFoundation) | video slides save as a still; swipe videos are off |
| Subject cutouts | `modules/seam-vision` (Vision, iOS 17+, real device) | shows an explanation |
| Face seam warnings | `modules/seam-vision` | no face warnings (text warnings still work) |

Subject lift needs the Neural Engine, so it fails in the iOS Simulator; face detection works there.

## What it does

- **One wide canvas, split into 1–20 slides** (4:5, 1:1, 3:4, 9:16). Seams are shown as dashed guides.
- **Dock**: the Seam mark as a tab bar. Home, Projects and You are slide-shaped tiles with one horizon running across them; the active tab is a window onto that picture that stretches across the seams as you switch, like a swipe. The last tile is an empty, dashed slide: tap it to deal a hand of blank slides (1:1, 4:5, 9:16, 3:4 and Templates) with a slide-count stepper, then tap a shape to start.
- **Projects tab**: every carousel, with folder chips, sorting (recently edited, newest, name) and long-press actions. Home shows the most recent ones.
- **You**: an optional name, stats (carousels, slides, files saved), the brand kit, What's New (with a badge until opened), settings, acknowledgements and the app version.
- **Acknowledgements**: every photographer, typeface and open-source library Seam ships, each with its licence text and any notice the licence asks for (You → Acknowledgements, or Settings → About).
- **Brand kit**: name, handle, website and tagline; up to 6 logos and 24 brand images (stickers, product shots, patterns); up to 24 colours, with a lead colour and colours pulled from a logo or photo; and up to four fonts (the first for headings, the second for body). Colours lead every colour row, brand fonts lead the text editor's font list, and logos and brand images drop onto the canvas from Shapes → Brand.
- **Apply brand kit** (editor ••• menu, or "With my brand" on a template): recolours a carousel by role (page, ink, accents), swaps in the brand fonts and replaces `@yourname` with your handle, keeping text readable. Up to four looks per kit, live preview, one undo step.
- **Grid puzzles**: a canvas of 3 × 1–4 tiles at 3:4, Instagram's profile shape. One photo spreads across the whole grid; several fill the tiles. Export saves each tile as its own post, numbered in posting order (bottom-right first), or the full picture.
- **Grid planner** (Projects → grid button, or You → Grid planner): a mock profile from the brand kit with queued carousels and puzzles on top in posting order, photos of existing posts below, and a warning when a puzzle would start mid-row.
- **Scheduling**: give a planned post a time (quick picks or the system calendar) and get a local reminder then; tapping it opens the planner. "Mark as posted" moves the post's tiles into the posted part of the grid. Press and hold a tile to drag it to a new spot.
- **Grid cover carousels**: in a grid puzzle's Grid panel, tap a post to make it the first slide of a new carousel. The tile stays in sync when the puzzle changes, and export and the planner mark it.
- **Start from photos** (Home, or the + fan): pick photos, see the templates that fit them filled with your own photos (crops keep faces centred and off seams), tap one to build the carousel.
- **Shuffle style** (editor •••): six restyles from curated palettes and font pairings (your brand's looks first), applied through the brand recolouring engine.
- **End card** (editor •••): a last slide with the brand logo, name, handle, a follow pill and website.
- **Save as template** (editor •••): photos become empty frames; saved designs appear under Templates → Mine and on Home.
- **Several brand kits**: switch, copy, rename or delete kits from the top of the Brand kit screen; Apply brand kit can use any of them.
- **Doodle stickers**: arrows, underlines, circles, hearts, stars, sparkles, routes and squiggles under Shapes, in the brand's lead colour.
- **Caption, hashtags and alt text** (Export → Caption): written on the device by Apple's Foundation Models when Apple Intelligence is available (`modules/seam-ai`), otherwise from the slides' text and Vision photo labels. Copy the caption with chosen hashtags; copy alt text per slide.
- **Motion Reels**: swipe videos and Reels can add a song from Files (faded out at the end), a gentle zoom between swipes, and a pace that times swipes to the beat. Grid puzzles export a 9:16 reveal reel, tiles landing in posting order.
- **Settings**: default format and slide count for new carousels, snapping, JPEG or PNG export, storage use (carousels, brand kit, cache, free space), Clear cache, Remove unused media, clear favourites, delete all carousels, and version / build / runtime.
- **Onboarding**: skippable pages on first launch, ending with "What will you make?" (Travel, Photo dump, Monthly recap, Events…). The picks drive a For you row on Home. You can also open a sample project.
- **Video layers**: add clips alongside photos. They play muted and looping in the editor (with sound in the preview). Trim on a filmstrip (drag either handle, or the middle to slide the window), mute, and double-tap to reposition the clip inside its frame. In a native build, slides with video export as H.264 MP4s with audio; everything else on the slide is composited over and under the clip.
- **Filters and adjustments**: 8 looks (Golden, Nordic, Vivid, Film, Matte, Mono, Noir) previewed on your own photo, plus exposure, contrast, saturation and warmth. Works on photos and videos (the same colour matrix drives the canvas and the video encoder).
- **Photos, text, stickers, shapes** as layers. Drag, pinch, rotate; snaps to slide centers, seams, the vertical middle and other layers' edges and centers, with a haptic tick.
- **Multi-select**: Select (in a layer's panel) turns on multi-select. Tap layers to add them, then move, scale and rotate them as one, align (to each other or to the slide), space evenly, group/ungroup, copy, lock, hide or delete together. Grouped layers select together.
- **Subject cutouts**: Cut out lifts the subject of a photo (iOS Vision) into a sticker layer placed exactly over it, with an outline and shadow that follow the subject's edge.
- **Frames**: square, circle, arch, polaroid, taped polaroid (washi tape), film strip and postage stamp, for photos and videos (exported videos are clipped to the same window).
- **Grids**: 18 grids (split, rows, columns, quad, hero, nine-cell, L-shapes, mosaic, filmstrip, magazine…), added under your photos. Drag a photo onto a cell to drop it in; drag between cells to move or swap.
- **Magic**: pick a mood (clean, editorial, playful, bold) and get three arrangements of your photos, plus a shuffle. Magic and the one-tap layouts nudge photos so detected faces don't land on a seam. Full-slide photos act as a backdrop: dragging them scrolls the canvas until you select them.
- **Crop inside the frame**: double-tap a photo (or Crop) to drag/pinch the image within its frame; the rest of the photo shows faintly outside.
- **Templates**: 38 designs, previewed with 32 bundled sample photos (from Unsplash, via Lorem Picsum) so they look finished (projects still start with empty slots). They use textured paper, polaroid, taped, film and stamp frames, photo looks that apply to the photos you add, and hand-drawn doodles (arrows, hearts, stars, dotted routes) that become editable drawing layers. Many run a photo, route or word across the seams. Tap one for a detail screen with a swipeable preview, tags and a favourite heart. The templates screen has search, filter chips (For you, Favorites, New, categories) and editorial collections. Designs: Photo Dump, Panorama, Travel Diary, Before/After, Quote, New Drop, Year in Review, Mood Board, Film Strip, Polaroid Wall, Arches, Circles, Headline, Zine, Story Sequence, Grid Recap, Save the Date, Product Launch, Summer Recap, Scrapbook, Monthly Recap, Wedding Day, Clean Lines, Postcard, Itinerary, Big Type, Contact Sheet, Notebook, Recipe Card, Tips Thread, Home Tour, Mixtape, Birthday, Countdown, Magazine, Gallery Wall, Outfit Notes and Reading List. They live in `src/lib/template-catalog.ts`, built from the pieces in `src/lib/template-kit.ts`. Adding photos fills the slots left to right; tap a slot (or Add photo / Replace) to choose its image. More can be delivered remotely: set `extra.templatesUrl` in `app.json` to a JSON array in the same shape (see `templates/remote.json`). The catalog is cached on disk, and a remote entry replaces a built-in one with the same id.
- **Layers**: the stack top-first with thumbnails. Tap to select, drag the handle to reorder, eye to hide (hidden layers are never drawn or exported), lock to pin a layer so canvas taps and drags pass through to what's below. Locked layers stay editable from their panel.
- **Adding slides**: every "+" opens a New Slide sheet: Blank, 12 single-slide layouts (full bleed, framed, split, stacked, offset, polaroid, taped, circle, arch, three across, hero + two, photo + caption) or any grid. Insert left, right or at the end.
- **Overview**: the grid button (or pinching in on empty canvas) shows every slide at once, each with a drag handle and a menu (add left/right, duplicate, move, delete).
- **Editor menu** (…): change the ratio after creating a project (layers are rescaled to fit), turn snapping on or off, select multiple, preview.
- **Draw**: freehand strokes with colours and four widths; Done turns them into a drawing layer you can move, recolour, lock and hide.
- **Slide strip**: live thumbnails; hold and drag a slide to reorder, or use the arrows. Duplicate, add and delete slides. Layers that sit on one slide travel with it; layers spanning a seam stay put.
- **Text style**: outline, pill or highlighter-bar backgrounds, curved text, letter spacing and a soft shadow; photos can have a drop shadow too. A native colour well picks any colour beyond the palette (iOS).
- **Type**: 8 bundled faces (Inter, Instrument Serif + Italic, Playfair Display, Space Grotesk, DM Mono, Caveat, Bebas Neue) drawn by Skia, so the canvas, the text input and the export match on every device. **+ Font** imports your own .ttf/.otf from Files; it's kept in the app and works in every project.
- **One-tap layouts**: Seamless (photos straddle the seams), Panorama, Full bleed, Framed, Stack, Scatter.
- **Seam warnings**: text or a detected face that crosses a seam gets a red marker, since it gets cut when swiping.
- **Backgrounds**: solid, gradient or one of ten tintable textures (paper, kraft, linen, film grain, concrete, canvas, grid paper, dot grid, notebook, speckle). Gradients and textures run across the whole canvas so they flow between slides.
- **Brand colours**: save colours with "+ Brand" (long-press to remove); they appear first in every colour row.
- **Feed preview** to swipe through the carousel before posting.
- **Export** shows a swipeable preview of the slides with one-tap Save, Instagram, TikTok, Share… (one slide, the panorama or a swipe video via the share sheet) and Template (a `seam://import?t=…` link that shares the design without its photos; opening it shows a preview and "Use template"). It saves 1080px-wide JPEGs to Photos in swipe order, the whole canvas as one panorama, or a swipe video that pans across the slides: at the post's size, or as a 9:16 Reel framed over a blurred backdrop with page dots.
- **Slide-aware edits**: adding or deleting a slide stretches or trims panoramas instead of dropping them.
- Projects can be sorted into folders (chips on Home; "Move to folder" in the long-press menu). Undo/redo, autosave (atomic, and on app background), rename (tap the title), project list with thumbnails, duplicate/delete (long-press a project). Projects opened and left without an edit (blank or from a template) are discarded.

## Look and feel

Liquid Glass (iOS 26+, blur elsewhere) floating top bar and tool dock, spring-animated panels, page dots, a native context menu on project cards (rename / duplicate / delete), an animated brand mark, and an export sheet with a progress ring.

## Under the hood

- Photos are stored twice per project: a full copy (up to 4096px) used only for export, and a 1280px preview the editor draws. Preview decodes live in a small LRU cache and are freed when a project closes; export decodes full-size photos one slide at a time and disposes them.
- `EditorCanvas`, `Slider` and the pager opt out of the React Compiler (`'use no memo'`): its memoization breaks Reanimated gesture worklets and crashes on the UI thread.

## Layout

```
src/app/            routes: (tabs)/index, projects, profile (the dock), editor/[id], preview, templates, template/[id],
                    import, brand-kit, grid, whats-new, settings, onboarding, acknowledgements/ (index, software, licence)
src/components/     doc-renderer (Skia), editor-canvas (gestures), panels, layer-panel, layers-panel, slides-panel,
                    multi-panel, video-trimmer, template-thumb, text-editor, export-sheet, brand-mark, project-menu,
                    color-well, ui
src/lib/            types, store (zustand + history), projects (file storage), images (SkImage cache),
                    text (Skia paragraphs, curves, highlights), fonts (bundled + imported), templates (+ remote), template-kit, template-catalog,
                    layouts (incl. grids and Magic), geometry, adjust (colour matrices), settings,
                    export (offscreen render + save; video slides and swipe videos via the native encoder)
modules/seam-video-export/  local Expo module: AVFoundation slide compositor, swipe-video panner, H.264 encoder
modules/seam-vision/        local Expo module: Vision face detection, photo labels and subject lift (cutouts)
modules/seam-ai/            local Expo module: captions, hashtags and alt text with Apple Foundation Models
templates/remote.json       sample remote template feed
src/theme.ts        colors, radii and type tokens
assets/brand/       icon source (seam-mark.svg)
assets/samples/     the 32 sample photos used in template previews
scripts/acknowledgements.mjs  builds src/generated/acknowledgements.json (see Credits)
```

The same `DocRenderer` draws the editor, preview, thumbnails and export, so what you see is what gets saved.

## Credits

Seam ships work by many people; the app lists all of it under **You → Acknowledgements**.

- **Photos**: the sample photos in `assets/samples/` are by Dmitrii Vaccinium, Paweł Wojciechowski, Roberto Nickson, Kevin Young, Tim de Groot, Christian Joudrey, Florian Klauer, Vashishtha Jogi, Matthew Skinner, Carli Jean, Roksolana Zasiadko, Paul E. Harrer, Charlie Foster, Desi Mendoza, Alexander Shustov, Bonnie Meisels, Joshua Earle, Danielle MacInnes, Glen Carrie, Mia Domenico, veeterzy, Annie Spratt, Vee O, Karl Fredrickson, Padurariu Alexandru, Luke Chesser, Daniel Robert, Jennifer Trovato and Alejandro Escamilla, published on [Unsplash](https://unsplash.com) under the [Unsplash License](https://unsplash.com/license) and found through [Lorem Picsum](https://picsum.photos) by David Marby and Nijiko Yonskai. Per-photo links are in `src/lib/credits.ts`.
- **Typefaces**: Inter, Instrument Serif, Playfair Display, Space Grotesk, DM Mono, Caveat and Bebas Neue under the SIL Open Font License 1.1, and Material Symbols (Android icons) under Apache 2.0, from Google Fonts via `@expo-google-fonts`.
- **Software**: React Native, Expo, Reanimated, Skia and the rest of the JavaScript and native libraries compiled into the app. `scripts/acknowledgements.mjs` reads the release bundles' source maps, the autolinked pods and a curated list of native code (Skia's codecs, React Native's C++ dependencies, expo-image's decoders, Android libraries), and writes `src/generated/acknowledgements.json`. Upstream licence texts for native code are cached in `scripts/licenses/`. Re-run it after adding or upgrading dependencies:

```bash
npm run acknowledgements
```
