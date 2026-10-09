// macOS smoke test for SlideVideoExporter and PanVideoExporter. Usage: seam-export-test <workDir>
// Expects <workDir>/src.mp4 (320x180 @30fps, 2s, quadrant colors on top, gray strip = frame*4 at the
// bottom, 440 Hz audio), <workDir>/src_rot.mov (same, with a 90° display rotation) and
// <workDir>/white.mp4 (solid white, 1s) for the clip-shape checks.
import AVFoundation
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let dir = URL(fileURLWithPath: CommandLine.arguments[1])
let W = 360, H = 640
var failures = 0

func writeOverlayPNG(_ url: URL) {
  let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!,
                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.clear(CGRect(x: 0, y: 0, width: W, height: H))
  // CG is y-up: a square at the TOP-left of the image is at y = H - 40.
  ctx.setFillColor(CGColor(red: 1, green: 0, blue: 1, alpha: 1))
  ctx.fill(CGRect(x: 0, y: H - 40, width: 40, height: 40))
  let img = ctx.makeImage()!
  let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, img, nil)
  CGImageDestinationFinalize(dest)
}

let overlay = dir.appendingPathComponent("overlay.png")
writeOverlayPNG(overlay)

func videoPart(_ file: String, start: Double, length: Double, matrix: [Double], fw: Double, fh: Double,
               radius: Double, draw: (Double, Double, Double, Double), opacity: Double = 1,
               colorMatrix: [Double]? = nil) -> SlidePartRecord {
  var p = SlidePartRecord()
  p.type = "video"
  p.uri = dir.appendingPathComponent(file).absoluteString
  p.start = start
  p.length = length
  p.matrix = matrix
  p.frameWidth = fw
  p.frameHeight = fh
  p.cornerRadius = radius
  var r = RectRecord()
  (r.x, r.y, r.width, r.height) = draw
  p.drawRect = r
  p.opacity = opacity
  p.colorMatrix = colorMatrix
  return p
}

func run(volume: Double, out: String) throws -> URL {
  var o = ExportSlideOptionsRecord()
  o.width = W; o.height = H; o.fps = 30; o.duration = 3
  // A: rotated source, upright 180x320, centered at (100, 200)
  let a = videoPart("src_rot.mov", start: 0.5, length: 1.0, matrix: [1, 0, 0, 1, 100, 200],
                    fw: 180, fh: 320, radius: 20, draw: (-90, -160, 180, 320))
  // B: unrotated source, 320x180 centered at (180, 500); used for the timing check
  let b = videoPart("src.mp4", start: 0.2, length: 0.7, matrix: [1, 0, 0, 1, 180, 500],
                    fw: 320, fh: 180, radius: 0, draw: (-160, -90, 320, 180))
  // C: rotated 20°, scaled 0.5, grayscale, 70% opacity, overlapping A (z above A)
  let ang = 20.0 * Double.pi / 180
  let s = 0.5
  let gray: [Double] = [0.2126, 0.7152, 0.0722, 0, 0,
                        0.2126, 0.7152, 0.0722, 0, 0,
                        0.2126, 0.7152, 0.0722, 0, 0,
                        0, 0, 0, 1, 0]
  let c = videoPart("src.mp4", start: 0, length: 2, matrix: [s * cos(ang), s * sin(ang), -s * sin(ang), s * cos(ang), 200, 220],
                    fw: 320, fh: 180, radius: 30, draw: (-160, -90, 320, 180), opacity: 0.7, colorMatrix: gray)
  var img = SlidePartRecord()
  img.type = "image"
  img.uri = overlay.absoluteString
  o.parts = [a, b, c, img]
  var au = AudioRecord()
  au.uri = dir.appendingPathComponent("src.mp4").absoluteString
  au.start = 0.5
  au.volume = volume
  o.audio = au
  let outURL = dir.appendingPathComponent(out)
  o.outputUri = outURL.absoluteString
  var last = -1.0
  let exporter = try SlideVideoExporter(options: o) { f in
    if f - last >= 0.25 || f >= 1 { print(String(format: "  progress %.2f", f)); last = f }
  }
  let t0 = Date()
  let result = try exporter.run()
  print("  -> \(result) in \(String(format: "%.2f", Date().timeIntervalSince(t0)))s")
  return outURL
}

// Timing check: part B's gray strip (output y 530..590) must show source frame
// floor((0.2 + (t mod 0.7)) * 30) => gray = N*4.
func checkTiming(_ url: URL) throws {
  let asset = AVURLAsset(url: url)
  let track = asset.tracks(withMediaType: .video).first!
  let reader = try AVAssetReader(asset: asset)
  let out = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
  reader.add(out)
  reader.startReading()
  var i = 0, bad = 0
  while let sb = out.copyNextSampleBuffer() {
    guard let pb = CMSampleBufferGetImageBuffer(sb) else { continue }
    CVPixelBufferLockBaseAddress(pb, .readOnly)
    let base = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
    let bpr = CVPixelBufferGetBytesPerRow(pb)
    var sum = 0
    for y in 545..<575 { for x in 100..<260 { sum += Int(base[y * bpr + x * 4 + 1]) } }
    CVPixelBufferUnlockBaseAddress(pb, .readOnly)
    let measured = Double(sum) / Double(30 * 160)
    let t = Double(i) / 30
    let local = t - floor(t / 0.7) * 0.7
    let n = Int(floor((0.2 + local + 0.001) * 30))
    let expected = Double(n * 4)
    let measuredFrame = Int((measured / 4).rounded())
    if measuredFrame != n {
      bad += 1
      print("  frame \(i) t=\(String(format: "%.3f", t)): expected src frame \(n) (gray \(expected)), measured \(String(format: "%.1f", measured)) ~ frame \(measuredFrame)")
    }
    i += 1
  }
  print("  timing check: \(i) frames, \(bad) mismatches")
  if bad > 0 { failures += 1 }
}

// MARK: - Helpers for the clip-shape and swipe-video checks

struct Frame {
  let bytes: [UInt8]
  let bytesPerRow: Int
  /// (r, g, b) at output pixel (x, y), top-left origin.
  func rgb(_ x: Int, _ y: Int) -> (Int, Int, Int) {
    let o = y * bytesPerRow + x * 4
    return (Int(bytes[o + 2]), Int(bytes[o + 1]), Int(bytes[o]))
  }
}

/// Decodes the given frame indices of a video as BGRA.
func readFrames(_ url: URL, _ wanted: Set<Int>) throws -> (frames: [Int: Frame], count: Int) {
  let asset = AVURLAsset(url: url)
  let track = asset.tracks(withMediaType: .video).first!
  let reader = try AVAssetReader(asset: asset)
  let out = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
  reader.add(out)
  reader.startReading()
  var frames: [Int: Frame] = [:]
  var i = 0
  while let sb = out.copyNextSampleBuffer() {
    guard let pb = CMSampleBufferGetImageBuffer(sb) else { continue }
    if wanted.contains(i) {
      CVPixelBufferLockBaseAddress(pb, .readOnly)
      let bpr = CVPixelBufferGetBytesPerRow(pb)
      let n = bpr * CVPixelBufferGetHeight(pb)
      let base = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
      frames[i] = Frame(bytes: Array(UnsafeBufferPointer(start: base, count: n)), bytesPerRow: bpr)
      CVPixelBufferUnlockBaseAddress(pb, .readOnly)
    }
    i += 1
  }
  return (frames, i)
}

func writePNG(width: Int, height: Int, to url: URL, draw: (CGContext) -> Void) {
  let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!,
                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.clear(CGRect(x: 0, y: 0, width: width, height: height))
  // Flip so drawing code can use top-left / y-down coordinates.
  ctx.translateBy(x: 0, y: CGFloat(height))
  ctx.scaleBy(x: 1, y: -1)
  draw(ctx)
  let img = ctx.makeImage()!
  let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, img, nil)
  CGImageDestinationFinalize(dest)
}

func expect(_ ok: Bool, _ what: String) {
  if !ok { failures += 1 }
  print("  [\(ok ? "ok" : "FAIL")] \(what)")
}
func isWhite(_ p: (Int, Int, Int)) -> Bool { p.0 > 200 && p.1 > 200 && p.2 > 200 }
func isBlack(_ p: (Int, Int, Int)) -> Bool { p.0 < 40 && p.1 < 40 && p.2 < 40 }

// MARK: - Clip shapes

/// Draws a solid white clip with 'ellipse', 'arch' and a frameRect-overridden rounded rect on black.
func runClips() throws {
  var o = ExportSlideOptionsRecord()
  o.width = W; o.height = H; o.fps = 30; o.duration = 1
  // Ellipse: frame 200x120 centered at (110, 100)
  var e = videoPart("white.mp4", start: 0, length: 1, matrix: [1, 0, 0, 1, 110, 100],
                    fw: 200, fh: 120, radius: 40, draw: (-100, -60, 200, 120))
  e.clip = "ellipse"
  // Arch: frame 160x240 centered at (260, 400) -> rect x 180...340, y 280...520, cap = 80 tall
  var a = videoPart("white.mp4", start: 0, length: 1, matrix: [1, 0, 0, 1, 260, 400],
                    fw: 160, fh: 240, radius: 0, draw: (-80, -120, 160, 240))
  a.clip = "arch"
  // Arch whose height is smaller than width/2: cap clamped to the frame height (pure half-ellipse).
  var flat = videoPart("white.mp4", start: 0, length: 1, matrix: [1, 0, 0, 1, 100, 600],
                       fw: 160, fh: 40, radius: 0, draw: (-80, -20, 160, 40))
  flat.clip = "arch"
  // frameRect override (polaroid inset): draw the clip full-size but only show x -50...50, y -60...20
  var f = videoPart("white.mp4", start: 0, length: 1, matrix: [1, 0, 0, 1, 90, 400],
                    fw: 160, fh: 200, radius: 10, draw: (-80, -100, 160, 200))
  var fr = RectRecord()
  (fr.x, fr.y, fr.width, fr.height) = (-50, -60, 100, 80)
  f.frameRect = fr
  o.parts = [e, a, flat, f]
  let outURL = dir.appendingPathComponent("out_clips.mp4")
  o.outputUri = outURL.absoluteString
  let result = try SlideVideoExporter(options: o) { _ in }.run()
  print("  -> \(result)")

  let (frames, count) = try readFrames(outURL, [15])
  expect(count == 30, "clip video has 30 frames (got \(count))")
  guard let fm = frames[15] else { expect(false, "frame 15 decoded"); return }
  // Ellipse
  expect(isWhite(fm.rgb(110, 100)), "ellipse center is filled")
  expect(isWhite(fm.rgb(20, 100)) && isWhite(fm.rgb(200, 100)), "ellipse is filled near its left/right extremes")
  expect(isBlack(fm.rgb(18, 46)) && isBlack(fm.rgb(202, 154)), "ellipse frame corners are clipped (not a rounded rect)")
  expect(isBlack(fm.rgb(40, 55)), "point outside the ellipse but inside a radius-40 rounded rect is clipped")
  // Arch
  expect(isBlack(fm.rgb(184, 284)) && isBlack(fm.rgb(336, 284)), "arch top corners are clipped")
  expect(isBlack(fm.rgb(200, 300)), "point just outside the arch cap is clipped")
  expect(isWhite(fm.rgb(260, 286)), "top of the arch cap is filled")
  expect(isWhite(fm.rgb(184, 366)) && isWhite(fm.rgb(336, 366)), "arch sides below the cap are filled")
  expect(isWhite(fm.rgb(184, 516)) && isWhite(fm.rgb(336, 516)), "arch bottom corners are square (filled)")
  // Clamped arch: 160x40 -> half-ellipse rx 80, ry 40 sitting on the bottom edge (y 580...620)
  expect(isWhite(fm.rgb(100, 584)) && isWhite(fm.rgb(100, 616)), "clamped arch is filled along its center line")
  expect(isBlack(fm.rgb(26, 584)) && isBlack(fm.rgb(174, 584)), "clamped arch top corners are clipped")
  expect(isWhite(fm.rgb(24, 616)) && isWhite(fm.rgb(176, 616)), "clamped arch reaches the full width at its base")
  // frameRect override: visible region x 40...140, y 340...420
  expect(isWhite(fm.rgb(90, 380)), "frameRect area is filled")
  expect(isBlack(fm.rgb(30, 380)) && isBlack(fm.rgb(150, 380)) && isBlack(fm.rgb(90, 330)) && isBlack(fm.rgb(90, 430)),
         "outside frameRect is clipped even though the default frame would show it")
  expect(isBlack(fm.rgb(41, 341)), "frameRect corners use cornerRadius")
}

// MARK: - Swipe (pan) video

let panW = 300, panH = 375
/// Wide strip the slides are cut from: red ramps continuously across all 3 slides, green
/// identifies the slide (0 / 128 / 255), blue is constant.
func stripRed(_ x: Int) -> Int { Int((Double(x) * 255 / Double(3 * panW - 1)).rounded()) }
let slideGreen = [0, 128, 255]

func easeInOutCubic(_ p: Double) -> Double { p < 0.5 ? 4 * p * p * p : 1 - pow(-2 * p + 2, 3) / 2 }

func runPan() throws {
  var slideURIs: [String] = []
  for i in 0..<3 {
    let url = dir.appendingPathComponent("slide\(i).png")
    writePNG(width: panW, height: panH, to: url) { ctx in
      for x in 0..<panW {
        let r = CGFloat(stripRed(i * panW + x)) / 255
        ctx.setFillColor(CGColor(srgbRed: r, green: CGFloat(slideGreen[i]) / 255, blue: 64.0 / 255, alpha: 1))
        ctx.fill(CGRect(x: x, y: 0, width: 1, height: panH))
      }
    }
    slideURIs.append(url.absoluteString)
  }
  // Background image: left half transparent (background color shows), right half orange.
  let bg = dir.appendingPathComponent("pan_bg.png")
  writePNG(width: W, height: H, to: bg) { ctx in
    ctx.setFillColor(CGColor(srgbRed: 0.8, green: 0.5, blue: 0.1, alpha: 1))
    ctx.fill(CGRect(x: W / 2, y: 0, width: W / 2, height: H))
  }

  var o = PanVideoOptionsRecord()
  o.slides = slideURIs
  o.width = W; o.height = H
  var win = RectRecord()
  (win.x, win.y, win.width, win.height) = (30, 60, Double(panW), Double(panH))
  o.window = win
  o.background = "#203040"
  o.backgroundImage = bg.absoluteString
  o.cornerRadius = 24
  o.fps = 30
  o.hold = 0.5
  o.move = 0.5
  var d = PanDotsRecord()
  d.y = 470; d.color = "#FFFFFF40"; d.activeColor = "#FFFFFF"; d.size = 12; d.gap = 10
  o.dots = d
  let outURL = dir.appendingPathComponent("out_pan.mp4")
  o.outputUri = outURL.absoluteString

  var progressEvents = 0
  var lastFraction = 0.0
  var monotonic = true
  let t0 = Date()
  let result = try PanVideoExporter(options: o) { f in
    progressEvents += 1
    if f < lastFraction { monotonic = false }
    lastFraction = f
  }.run()
  print("  -> \(result) in \(String(format: "%.2f", Date().timeIntervalSince(t0)))s")
  expect(monotonic && lastFraction >= 0.999, "progress is monotonic and reaches 1 (\(progressEvents) callbacks)")

  // 3*0.5 + 2*0.5 = 2.5s -> 75 frames
  let checkFrames: Set<Int> = [5, 22, 23, 37, 52, 74]
  let (frames, count) = try readFrames(outURL, checkFrames)
  expect(count == 75, "75 frames for 2.5s @ 30fps (got \(count))")

  let rowY = 60 + panH / 2
  /// Expected (slide, strip column) at window column u for frame `index`.
  func expected(_ index: Int, _ u: Int) -> (slide: Int, column: Int) {
    let t = Double(index) / 30
    let period = 1.0
    let k = Int(floor(t / period))
    var slide = min(k, 2)
    var shift = 0
    if k < 2 {
      let local = t - Double(k) * period
      if local >= 0.5 {
        shift = Int((easeInOutCubic((local - 0.5) / 0.5) * Double(panW)).rounded())
      }
    }
    var col = slide * panW + shift + u
    if shift + u >= panW { slide += 1; col = slide * panW + (shift + u - panW) }
    return (slide, col)
  }

  for index in checkFrames.sorted() {
    guard let fm = frames[index] else { expect(false, "frame \(index) decoded"); continue }
    var bad = 0
    var slidesSeen = Set<Int>()
    var checked = 0
    for u in stride(from: 4, to: panW - 4, by: 2) {
      let e = expected(index, u)
      let (r, g, _) = fm.rgb(30 + u, rowY)
      // Skip pixels right next to the seam (chroma subsampling smears the green step).
      let neighbours = [expected(index, max(0, u - 3)).slide, expected(index, min(panW - 1, u + 3)).slide]
      if neighbours.contains(where: { $0 != e.slide }) { continue }
      checked += 1
      slidesSeen.insert(e.slide)
      if abs(r - stripRed(e.column)) > 8 || abs(g - slideGreen[e.slide]) > 24 { bad += 1 }
    }
    let label = slidesSeen.count > 1 ? "slides \(slidesSeen.sorted()) side by side" : "slide \(slidesSeen.first ?? -1) at rest"
    expect(bad == 0, "frame \(index): window row matches the continuous strip, \(label) (\(checked) px checked, \(bad) off)")
  }

  if let mid = frames[22] {
    // Rounded window corner shows the background color (left half, no background image there).
    let corner = mid.rgb(31, 61)
    expect(abs(corner.0 - 0x20) < 12 && abs(corner.1 - 0x30) < 12 && abs(corner.2 - 0x40) < 12,
           "rounded window corner shows the background color #203040 (got \(corner))")
    let right = mid.rgb(350, 20)
    expect(abs(right.0 - 204) < 14 && abs(right.1 - 128) < 14 && abs(right.2 - 26) < 14,
           "background image covers the right half outside the window (got \(right))")
  }
  // Dots: 3 dots, 12px, gap 10 -> centers at 180-22, 180, 180+22 (window is centered at x=180).
  // Blue channel: inactive = 25% white over the background (blue 64 / 26) stays < 130, active = 255.
  func dot(_ fm: Frame, _ j: Int) -> Int { fm.rgb(180 + (j - 1) * 22, 470).2 }
  if let f5 = frames[5], let f74 = frames[74], let f37 = frames[37] {
    expect(dot(f5, 0) > 230 && dot(f5, 1) < 130 && dot(f5, 2) < 130, "dots: first active at the start (\(dot(f5, 0)), \(dot(f5, 1)), \(dot(f5, 2)))")
    expect(dot(f37, 1) > 230 && dot(f37, 0) < 130 && dot(f37, 2) < 130, "dots: middle active while resting on slide 1 (\(dot(f37, 0)), \(dot(f37, 1)), \(dot(f37, 2)))")
    expect(dot(f74, 2) > 230 && dot(f74, 0) < 130 && dot(f74, 1) < 130, "dots: last active at the end (\(dot(f74, 0)), \(dot(f74, 1)), \(dot(f74, 2)))")
  }
  if let f22 = frames[22] {
    let a = dot(f22, 0), b = dot(f22, 1)
    expect(a > 140 && a < 235 && b > 130 && b < 235, "dots: mid-swipe the active color is shared between dots 0 and 1 (\(a), \(b))")
  }
}

do {
  print("export volume 0.5 (re-encode path)")
  let u1 = try run(volume: 0.5, out: "out_half.mp4")
  try checkTiming(u1)
  print("export volume 1.0 (passthrough path)")
  let u2 = try run(volume: 1.0, out: "out_full.mp4")
  try checkTiming(u2)
  print("clip shapes (ellipse / arch / frameRect)")
  try runClips()
  print("swipe video (exportPanVideo)")
  try runPan()
} catch {
  print("FAILED: \(error)")
  exit(1)
}
if failures > 0 {
  print("FAILED: \(failures) check(s)")
  exit(1)
}
print("all checks passed")
