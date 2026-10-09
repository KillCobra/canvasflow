#!/usr/bin/env bash
# Builds the Vision core (minus the Expo module glue) as a macOS CLI and runs a smoke test.
# Requires macOS 14+, ImageMagick (`magick`) and `sips`. Usage: ./run-macos-test.sh [workDir]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
IOS="$HERE/../ios"
WORK="${1:-$(mktemp -d)}"
mkdir -p "$WORK"

# A photo with a clear foreground subject (ships with macOS), made non-square so rotations show.
PHOTO="${SEAM_TEST_PHOTO:-/Library/User Pictures/Animals/Penguin.heic}"
sips -s format png "$PHOTO" --out "$WORK/photo_full.png" >/dev/null
magick "$WORK/photo_full.png" -resize 1000x1000 -gravity north -crop 1000x760+0+120 +repage "$WORK/subject.png"
# Same displayed image, stored rotated/flipped with the matching EXIF orientation tag.
magick "$WORK/subject.png" -rotate 180 -orient BottomRight -quality 97 "$WORK/subject_o3.jpg"
magick "$WORK/subject.png" -rotate -90 -orient RightTop -quality 97 "$WORK/subject_o6.jpg"
magick "$WORK/subject.png" -rotate 90 -orient LeftBottom -quality 97 "$WORK/subject_o8.jpg"
magick "$WORK/subject.png" -flop -orient TopRight -quality 97 "$WORK/subject_o2.jpg"

# Synthetic face (may or may not be detected; the test skips if not).
magick -size 600x700 xc:'#c9d6e3' \
  -fill '#3b2a20' -draw "ellipse 300,250 150,150 180,360" \
  -fill '#e0ac8a' -draw "ellipse 300,315 125,160 0,360" \
  -fill '#3b2a20' -draw "roundrectangle 215,232 285,242 4,4" -draw "roundrectangle 315,232 385,242 4,4" \
  -fill white -draw "ellipse 250,275 26,14 0,360" -draw "ellipse 350,275 26,14 0,360" \
  -fill '#4a3020' -draw "circle 250,275 250,286" -draw "circle 350,275 350,286" \
  -fill black -draw "circle 250,275 250,280" -draw "circle 350,275 350,280" \
  -fill '#c98f70' -draw "polygon 300,290 284,350 316,350" \
  -fill '#a0453f' -draw "ellipse 300,390 40,14 0,360" \
  -blur 0x1.2 "$WORK/face.png"
magick "$WORK/face.png" -rotate -90 -orient RightTop -quality 97 "$WORK/face_o6.jpg"

# Optional real photo with faces. Defaults to a Camera onboarding portrait (EXIF orientation 6)
# from the locally installed iOS Simulator runtime, if present.
FACE_PHOTO="${SEAM_TEST_FACE_PHOTO:-}"
if [ -z "$FACE_PHOTO" ]; then
  FACE_PHOTO="$(find /Library/Developer/CoreSimulator/Volumes -path '*CameraUI.framework/SmartStylesOnboarding/StylesOnboarding_ROW_2.HEIC' 2>/dev/null | head -1 || true)"
fi
rm -f "$WORK/portrait.heic"
if [ -n "$FACE_PHOTO" ] && [ -f "$FACE_PHOTO" ]; then
  cp "$FACE_PHOTO" "$WORK/portrait.heic"
fi

# No subject: a flat gradient.
magick -size 800x600 gradient:'#88aacc'-'#c8d8e8' "$WORK/plain.png"

swiftc -O -target arm64-apple-macos14 -o "$WORK/seam-vision-test" \
  "$HERE/main.swift" "$IOS/SeamVisionProcessor.swift"

"$WORK/seam-vision-test" "$WORK"
echo "work dir: $WORK"
