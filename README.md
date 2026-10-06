# CanvasFlow

Create photo collages and swipe-through carousel posts on one continuous canvas, then export clean, correctly-sized slides whose edges line up seamlessly.

CanvasFlow is an **original application** — its product design, interface, visual identity, copy, icons, templates, and sample content are independently created. It is a general-purpose collage / carousel design tool and does not imitate or incorporate any other app's name, assets, layouts, or branding.

---

## What it does

- **Account-free start.** Brief onboarding, then straight into creating — no sign-up.
- **Home.** "New design," recent projects, and original starter templates grouped by use case.
- **New project.** Pick a format (square post, portrait post, story, or custom), set 2–10 slides, start blank or from a template.
- **Editor.** Zoomable/pannable continuous canvas with visible slide boundaries; import photos; add/move/resize/rotate/duplicate/reorder/delete elements; text, shapes, background colors and gradients; snapping guides, layer ordering, undo/redo, and fit-to-screen.
- **Preview.** Swipe through each slide exactly as it will export.
- **Export.** Splits the design into correctly-sized slide PNGs with progress, success, and error states, saved to on-device app storage.
- **Projects.** Local autosave; rename, duplicate, reopen, and delete.

---

## Project structure

```
lib/
  models/        canvas_models.dart     Project, Slide-sizing, Element data + JSON
  services/
    slice_engine.dart     Pure canvas→slide geometry (unit-tested)
    project_store.dart     Local persistence + media import
    export_service.dart    Renders each slide to PNG
    snapping.dart          Alignment/snap guides
    templates.dart         Original code-generated starter templates
  state/         editor_controller.dart  Selection, undo/redo, autosave
  widgets/       canvas_painter.dart      Shared renderer (editor == export)
  theme/         app_theme.dart           Original visual identity
  screens/       onboarding, home, new_project, editor, preview, export
test/            slice_engine_test.dart, project_model_test.dart
.github/workflows/ios-release.yml         Builds iOS on release tags
```

The **same renderer** (`CanvasRenderer`) draws both the on-screen canvas and the exported slices, so previews match exports exactly. Slides are produced by translating the continuous canvas by `-slideWidth * slideIndex` and clipping to one slide — elements that cross a boundary are split consistently, which is what makes a seamless carousel.

---

## Setup

Requires the Flutter SDK (built/tested on Flutter 3.24.3, Dart 3.5).

```bash
flutter pub get
flutter test          # run the test suite
flutter run           # run on a connected device or simulator
```

To build for iOS locally (requires macOS + Xcode):

```bash
flutter build ios --release --no-codesign
```

---

## Tests

`flutter test` covers the logic the product depends on:

- **Slide sizing** — format default sizes, canvas span, per-slide dimensions, bounds checks.
- **Canvas-to-slide cropping** — coordinate→slide mapping, elements within/across/spanning boundaries, exact-boundary edge cases, seam offset math.
- **Export boundary alignment** — adjacent slides share the exact seam coordinate with no gaps or overlaps (including non-integer custom sizes).
- **Project saving** — JSON serialization round-trips projects and elements intact.

---

## iOS build on release tag (GitHub Actions)

Pushing a tag like `v0.1.0` triggers `.github/workflows/ios-release.yml`, which on a macOS runner installs Flutter, runs analyze + tests, builds the iOS app **unsigned**, and attaches the artifact to the GitHub Release.

```bash
git tag v0.1.0
git push origin v0.1.0
```

### iOS signing (optional, for installing on a physical device)
The CI build is **unsigned** so it runs without a paid account. To install on a real iPhone you need an **Apple Developer account** and to add signing (certificate, provisioning profile, and `exportOptions.plist`) via repository secrets, then switch the build step to a signed `flutter build ipa`. Signing is intentionally not included here.

---

## Permissions

- **Photo library (read):** to import photos into a design (native photo picker).
- **Add to Photos (iOS) / storage (Android):** requested before export; the app still exports to its own on-device storage if this is limited or denied, and surfaces a clear message.

Imported media is copied into the app's documents directory and kept **on-device by default**.

---

## Limitations (honest scope)

- **Export target is on-device app storage.** The app shows the exact save location. It does **not** post directly to any social platform — no such integration is implemented, and none is claimed.
- **No background removal or stock-asset library.** Those features in some collage apps rely on paid ML services / licensed content and are out of scope. The code leaves room to add them behind your own API later.
- **Decorative elements** are a small original set (shapes, text, colors, gradients) rather than a large bundled asset pack.
- **iOS artifacts from CI are unsigned.** See "iOS signing" to install on hardware.
- Built against Flutter 3.24.3; newer Flutter APIs (e.g. `Color.withValues`) are intentionally avoided for compatibility.

---

## Originality

All branding, copy, templates, placeholder content, color palette (warm neutral + deep blue), and screen layouts are created specifically for CanvasFlow. Export boundaries are verified by tests to align cleanly between slides.
