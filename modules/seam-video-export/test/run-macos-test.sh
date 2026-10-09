#!/usr/bin/env bash
# Builds the renderers (minus the Expo module glue) as a macOS CLI and runs the smoke tests.
# Requires ffmpeg. Usage: ./run-macos-test.sh [workDir]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
IOS="$HERE/../ios"
WORK="${1:-$(mktemp -d)}"
mkdir -p "$WORK"

# Source clip: quadrants (TL red, TR green, BL blue, BR yellow) above a gray strip = frame*4.
R='if(lt(Y,120),if(lt(Y,60),if(lt(X,160),255,0),if(lt(X,160),0,255)),N*4)'
G='if(lt(Y,120),if(lt(Y,60),if(lt(X,160),0,255),if(lt(X,160),0,255)),N*4)'
B='if(lt(Y,120),if(lt(Y,60),0,if(lt(X,160),255,0)),N*4)'
ffmpeg -loglevel error -y -f lavfi -i "color=c=black:s=320x180:r=30:d=2,format=rgb24,geq=r='$R':g='$G':b='$B'" \
  -f lavfi -i "sine=frequency=440:duration=2" -c:v libx264 -pix_fmt yuv420p -crf 10 -g 15 -c:a aac -shortest "$WORK/src.mp4"
ffmpeg -loglevel error -y -display_rotation 90 -i "$WORK/src.mp4" -c copy "$WORK/src_rot.mov"
# Solid white clip for the clip-shape checks.
ffmpeg -loglevel error -y -f lavfi -i "color=c=white:s=320x320:r=30:d=1" -c:v libx264 -pix_fmt yuv420p "$WORK/white.mp4"

# Pull the Record structs out of the module file (everything before "// MARK: - Module").
sed -n '/MARK: - Options/,/MARK: - Module/p' "$IOS/SeamVideoExportModule.swift" | grep -v '^import' > "$WORK/Records.swift"

swiftc -O -target arm64-apple-macos15 -o "$WORK/seam-export-test" \
  "$HERE/ExpoShim.swift" "$WORK/Records.swift" "$HERE/main.swift" \
  "$IOS/SeamExportUtils.swift" "$IOS/SeamVideoEncoder.swift" "$IOS/VideoFrameSource.swift" \
  "$IOS/SlideVideoExporter.swift" "$IOS/PanVideoExporter.swift"

"$WORK/seam-export-test" "$WORK"
for f in out_half out_full out_clips out_pan; do
  echo "== $f"
  ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,duration,nb_frames,r_frame_rate,bit_rate -of compact "$WORK/$f.mp4"
done
# Stills for eyeballing: rest on slide 0, mid-swipe 0->1, rest on the last slide; clip shapes.
ffmpeg -loglevel error -y -i "$WORK/out_pan.mp4" -vf "select='eq(n,5)+eq(n,22)+eq(n,74)',tile=3x1" -fps_mode vfr -frames:v 1 "$WORK/pan_frames.png"
ffmpeg -loglevel error -y -i "$WORK/out_clips.mp4" -vf "select='eq(n,15)'" -frames:v 1 "$WORK/clips_frame.png"
echo "work dir: $WORK"
