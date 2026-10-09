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
- **Onboarding**: three skippable pages on first launch, with an option to open a sample project.
- **Video layers**: add clips alongside photos. They play muted and looping in the editor (with sound in the preview). Trim on a filmstrip (drag either handle, or the middle to slide the window), mute, and double-tap to reposition the clip inside its frame. In a native build, slides with video export as H.264 MP4s with audio; everything else on the slide is composited over and under the clip.
- **Filters and adjustments**: 8 looks (Golden, Nordic, Vivid, Film, Matte, Mono, Noir) previewed on your own photo, plus exposure, contrast, saturation and warmth. Works on photos and videos (the same colour matrix drives the canvas and the video encoder).
- **Photos, text, stickers, shapes** as layers. Drag, pinch, rotate; snaps to slide centers, seams, the vertical middle and other layers' edges and centers, with a haptic tick.
- **Multi-select**: Select (in a layer's panel) turns on multi-select. Tap layers to add them, then move, scale and rotate them as one, align (to each other or to the slide), space evenly, group/ungroup, copy, lock, hide or delete together. Grouped layers select together.
- **Subject cutouts**: Cut out lifts the subject of a photo (iOS Vision) into a sticker layer placed exactly over it, with an outline and shadow that follow the subject's edge.
- **Frames**: square, circle, arch and polaroid, for photos and videos (exported videos are clipped to the same shape).
- **Grids**: split, rows, columns, quad, hero and nine-cell grids, added under your photos. Drag a photo onto a cell to drop it in; drag between cells to move or swap.
- **Magic**: pick a mood (clean, editorial, playful, bold) and get three arrangements of your photos, plus a shuffle. Magic and the one-tap layouts nudge photos so detected faces don't land on a seam. Full-slide photos act as a backdrop: dragging them scrolls the canvas until you select them.
- **Crop inside the frame**: double-tap a photo (or Crop) to drag/pinch the image within its frame; the rest of the photo shows faintly outside.
- **Templates**: 18 designs (Photo Dump, Panorama, Travel Diary, Before/After, Quote, New Drop, Year in Review, Mood Board, Film Strip, Polaroid Wall, Arches, Circles, Headline, Zine, Story Sequence, Grid Recap, Save the Date, Product Launch) with empty photo slots. Adding photos fills the slots left to right; tap a slot (or Add photo / Replace) to choose its image. More can be delivered remotely: set `extra.templatesUrl` in `app.json` to a JSON array in the same shape (see `templates/remote.json`). The catalog is cached on disk, and a remote entry replaces a built-in one with the same id.
- **Layers**: the stack top-first with thumbnails. Tap to select, drag the handle to reorder, eye to hide (hidden layers are never drawn or exported), lock to pin a layer so canvas taps and drags pass through to what's below. Locked layers stay editable from their panel.
- **Slide strip**: live thumbnails; hold and drag a slide to reorder, or use the arrows. Duplicate, add and delete slides. Layers that sit on one slide travel with it; layers spanning a seam stay put.
- **Text style**: outline, pill or highlighter-bar backgrounds, curved text, letter spacing and a soft shadow; photos can have a drop shadow too. A native colour well picks any colour beyond the palette (iOS).
- **Type**: 8 bundled faces (Inter, Instrument Serif + Italic, Playfair Display, Space Grotesk, DM Mono, Caveat, Bebas Neue) drawn by Skia, so the canvas, the text input and the export match on every device. **+ Font** imports your own .ttf/.otf from Files; it's kept in the app and works in every project.
- **One-tap layouts**: Seamless (photos straddle the seams), Panorama, Full bleed, Framed, Stack, Scatter.
- **Seam warnings**: text or a detected face that crosses a seam gets a red marker, since it gets cut when swiping.
- **Gradient backdrops** run across the whole canvas so they flow between slides.
- **Feed preview** to swipe through the carousel before posting.
- **Export** saves 1080px-wide JPEGs to Photos in swipe order, the whole canvas as one panorama, or a swipe video that pans across the slides: at the post's size, or as a 9:16 Reel framed over a blurred backdrop with page dots.
- **Slide-aware edits**: adding or deleting a slide stretches or trims panoramas instead of dropping them.
- Undo/redo, autosave (atomic, and on app background), rename (tap the title), project list with thumbnails, duplicate/delete (long-press a project). Projects opened and left without an edit (blank or from a template) are discarded.

## Look and feel

Liquid Glass (iOS 26+, blur elsewhere) floating top bar and tool dock, spring-animated panels, page dots, a native context menu on project cards (rename / duplicate / delete), an animated brand mark, and an export sheet with a progress ring.

## Under the hood

- Photos are stored twice per project: a full copy (up to 4096px) used only for export, and a 1280px preview the editor draws. Preview decodes live in a small LRU cache and are freed when a project closes; export decodes full-size photos one slide at a time and disposes them.
- `EditorCanvas`, `Slider` and the pager opt out of the React Compiler (`'use no memo'`): its memoization breaks Reanimated gesture worklets and crashes on the UI thread.

## Layout

```
src/app/            routes: index (home), editor/[id], preview (modal), templates (modal), onboarding
src/components/     doc-renderer (Skia), editor-canvas (gestures), panels, layer-panel, layers-panel, slides-panel,
                    multi-panel, video-trimmer, template-thumb, text-editor, export-sheet, brand-mark, project-menu,
                    color-well, ui
src/lib/            types, store (zustand + history), projects (file storage), images (SkImage cache),
                    text (Skia paragraphs, curves, highlights), fonts (bundled + imported), templates (+ remote),
                    layouts (incl. grids and Magic), geometry, adjust (colour matrices), settings,
                    export (offscreen render + save; video slides and swipe videos via the native encoder)
modules/seam-video-export/  local Expo module: AVFoundation slide compositor, swipe-video panner, H.264 encoder
modules/seam-vision/        local Expo module: Vision face detection and subject lift (cutouts)
templates/remote.json       sample remote template feed
src/theme.ts        colors, radii and type tokens
assets/brand/       icon source (seam-mark.svg)
```

The same `DocRenderer` draws the editor, preview, thumbnails and export, so what you see is what gets saved.
