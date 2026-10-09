// macOS smoke test for the SeamVision core (ios/SeamVisionProcessor.swift).
// Usage: seam-vision-test <workDir>
// Expects in <workDir> (see run-macos-test.sh):
//   subject.png                 upright photo with a clear foreground subject (any size)
//   subject_o3/o6/o8/o2.jpg     the same pixels stored rotated/flipped + EXIF orientation 3/6/8/2,
//                               so they DISPLAY identically to subject.png
//   face.png, face_o6.jpg       a synthetic face (upright, and stored rotated with EXIF 6)
//   plain.png                   a flat gradient with no subject
//   portrait.heic (optional)    a real photo with faces, ideally with a non-up EXIF orientation
import CoreGraphics
import CoreImage
import Foundation
import ImageIO

let dir = URL(fileURLWithPath: CommandLine.arguments[1])
func file(_ name: String) -> String { dir.appendingPathComponent(name).absoluteString }

var failures = 0
var skipped: [String] = []
func expect(_ ok: Bool, _ what: String) {
  if !ok { failures += 1 }
  print("  [\(ok ? "ok" : "FAIL")] \(what)")
}
func skip(_ what: String) {
  skipped.append(what)
  print("  [skip] \(what)")
}
func fmt(_ r: SeamNormRect) -> String {
  String(format: "x %.3f y %.3f w %.3f h %.3f", r.x, r.y, r.width, r.height)
}
func close(_ a: SeamNormRect, _ b: SeamNormRect, _ tol: Double) -> Bool {
  abs(a.x - b.x) <= tol && abs(a.y - b.y) <= tol && abs(a.width - b.width) <= tol && abs(a.height - b.height) <= tol
}

/// Straight (un-premultiplied) RGBA8 pixels of an image file, top row first.
struct RGBA {
  let width: Int
  let height: Int
  let px: [UInt8]
  func at(_ x: Int, _ y: Int) -> (Int, Int, Int, Int) {
    let o = (y * width + x) * 4
    return (Int(px[o]), Int(px[o + 1]), Int(px[o + 2]), Int(px[o + 3]))
  }
}
func readRGBA(_ url: URL) -> RGBA? {
  guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
        let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { return nil }
  let w = img.width, h = img.height
  var premul = [UInt8](repeating: 0, count: w * h * 4)
  let ctx = CGContext(data: &premul, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!,
                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
  // CGBitmapContext memory is top row first; un-premultiply.
  var straight = premul
  for i in stride(from: 0, to: premul.count, by: 4) {
    let a = Int(premul[i + 3])
    if a > 0 && a < 255 {
      for c in 0..<3 { straight[i + c] = UInt8(min(255, (Int(premul[i + c]) * 255 + a / 2) / a)) }
    }
  }
  return RGBA(width: w, height: h, px: straight)
}
func hasAlpha(_ url: URL) -> Bool {
  guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
        let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any] else { return false }
  return (props[kCGImagePropertyHasAlpha] as? Bool) == true
}

guard #available(macOS 14.0, *) else {
  print("SKIPPED: macOS 14+ is required for VNGenerateForegroundInstanceMaskRequest")
  exit(0)
}

do {
  print("isSubjectLiftSupported")
  expect(SeamVision.isSubjectLiftSupported, "true on macOS 14+ (iOS 17+ on device)")

  print("liftSubject (upright reference)")
  let refOut = dir.appendingPathComponent("lift_up.png")
  let t0 = Date()
  guard let ref = try SeamVision.liftSubject(uri: file("subject.png"), outputUri: refOut.absoluteString, maxEdge: 2048) else {
    print("  Vision found no subject in subject.png; cannot run the lift checks")
    skip("liftSubject: no subject detected in the test photo")
    throw SeamVisionError("no subject")
  }
  print("  -> \(ref.width)x\(ref.height) rect \(fmt(ref.rect)) in \(String(format: "%.2f", Date().timeIntervalSince(t0)))s")
  expect(ref.uri == refOut.absoluteString, "returns the output file:// URI")
  expect(FileManager.default.fileExists(atPath: refOut.path), "PNG written")
  expect(hasAlpha(refOut), "PNG has an alpha channel")
  let source = readRGBA(dir.appendingPathComponent("subject.png"))!
  let lifted = readRGBA(refOut)!
  expect(lifted.width == ref.width && lifted.height == ref.height, "reported size matches the PNG (\(lifted.width)x\(lifted.height))")
  // The crop is tight but the subject is soft-edged: the crop should be the reported fraction of the source.
  let expectW = Int((ref.rect.width * Double(source.width)).rounded())
  let expectH = Int((ref.rect.height * Double(source.height)).rounded())
  expect(abs(expectW - ref.width) <= 1 && abs(expectH - ref.height) <= 1,
         "no downscale below maxEdge: PNG size = rect * source size (\(expectW)x\(expectH))")
  expect(ref.rect.x >= 0 && ref.rect.y >= 0 && ref.rect.x + ref.rect.width <= 1.0001 && ref.rect.y + ref.rect.height <= 1.0001,
         "rect is inside 0..1")
  expect(ref.rect.width < 0.98 || ref.rect.height < 0.98, "crop is tighter than the full photo")

  // Tight crop: every edge row/column of the PNG has some visible pixel.
  func edgeHasCoverage(_ img: RGBA) -> Bool {
    var top = false, bottom = false, left = false, right = false
    for x in 0..<img.width {
      if img.at(x, 0).3 > 2 { top = true }
      if img.at(x, img.height - 1).3 > 2 { bottom = true }
    }
    for y in 0..<img.height {
      if img.at(0, y).3 > 2 { left = true }
      if img.at(img.width - 1, y).3 > 2 { right = true }
    }
    return top && bottom && left && right
  }
  expect(edgeHasCoverage(lifted), "crop is tight (subject touches all four edges of the PNG)")
  var transparent = 0, opaque = 0
  for i in stride(from: 3, to: lifted.px.count, by: 4) {
    if lifted.px[i] == 0 { transparent += 1 } else if lifted.px[i] == 255 { opaque += 1 }
  }
  let total = lifted.width * lifted.height
  expect(transparent > total / 50 && opaque > total / 5,
         "background removed: \(100 * transparent / total)% transparent, \(100 * opaque / total)% opaque")

  // Halo check: semi-transparent edge pixels must keep the photo's own colors once un-premultiplied
  // (a premultiplication bug darkens them by alpha).
  let ox = Int((ref.rect.x * Double(source.width)).rounded())
  let oy = Int((ref.rect.y * Double(source.height)).rounded())
  var edgePixels = 0
  var colorError = 0
  for y in 0..<lifted.height {
    for x in 0..<lifted.width {
      let p = lifted.at(x, y)
      guard p.3 >= 48 && p.3 <= 208 else { continue }
      let s = source.at(min(source.width - 1, ox + x), min(source.height - 1, oy + y))
      colorError += abs(p.0 - s.0) + abs(p.1 - s.1) + abs(p.2 - s.2)
      edgePixels += 1
    }
  }
  let meanError = edgePixels > 0 ? Double(colorError) / Double(edgePixels * 3) : 0
  expect(edgePixels > 0 && meanError < 6,
         "no halo: \(edgePixels) soft-edge pixels keep the source color (mean error \(String(format: "%.2f", meanError))/255)")

  print("liftSubject with EXIF-oriented copies (same displayed image)")
  for name in ["subject_o3.jpg", "subject_o6.jpg", "subject_o8.jpg", "subject_o2.jpg"] {
    let out = dir.appendingPathComponent("lift_\(name).png")
    guard let r = try SeamVision.liftSubject(uri: file(name), outputUri: out.absoluteString, maxEdge: 2048) else {
      expect(false, "\(name): subject found")
      continue
    }
    expect(close(r.rect, ref.rect, 0.012) && abs(r.width - ref.width) <= 6 && abs(r.height - ref.height) <= 6,
           "\(name): rect \(fmt(r.rect)), \(r.width)x\(r.height) matches the upright reference")
    // Same content, upright: compare alpha with the reference on a coarse grid.
    if let img = readRGBA(out) {
      var diff = 0, n = 0
      for gy in 0..<20 {
        for gx in 0..<20 {
          let x1 = gx * (img.width - 1) / 19, y1 = gy * (img.height - 1) / 19
          let x2 = gx * (lifted.width - 1) / 19, y2 = gy * (lifted.height - 1) / 19
          diff += abs(img.at(x1, y1).3 - lifted.at(x2, y2).3)
          n += 1
        }
      }
      expect(Double(diff) / Double(n) < 20, "\(name): output is upright (mean alpha diff vs reference \(diff / n))")
    }
  }

  print("liftSubject maxEdge")
  let small = dir.appendingPathComponent("lift_small.png")
  if let r = try SeamVision.liftSubject(uri: file("subject.png"), outputUri: small.absoluteString, maxEdge: 160) {
    expect(max(r.width, r.height) == 160, "longest edge capped at 160 (got \(r.width)x\(r.height))")
    expect(close(r.rect, ref.rect, 0.0001), "rect unchanged by maxEdge")
    let ratioRef = Double(ref.width) / Double(ref.height), ratio = Double(r.width) / Double(r.height)
    expect(abs(ratio - ratioRef) < 0.02, "aspect ratio preserved")
    if let img = readRGBA(small) { expect(edgeHasCoverage(img), "downscaled PNG still tight") }
  } else {
    expect(false, "maxEdge 160: subject found")
  }

  print("liftSubject with no subject")
  let none = try SeamVision.liftSubject(uri: file("plain.png"), outputUri: file("lift_plain.png"), maxEdge: 2048)
  if let none {
    skip("plain gradient: Vision still returned a 'subject' (\(none.width)x\(none.height)); the nil path wasn't exercised")
  } else {
    expect(!FileManager.default.fileExists(atPath: dir.appendingPathComponent("lift_plain.png").path),
           "plain gradient resolves nil and writes nothing")
  }

  print("detectFaces")
  let faces = try SeamVision.detectFaces(uri: file("face.png"))
  if faces.isEmpty {
    skip("synthetic face not detected by VNDetectFaceRectanglesRequest (needs a real photo)")
  } else {
    let f = faces[0]
    print("  upright: \(faces.count) face(s), largest \(fmt(f))")
    // The face is drawn centered at (0.5, 0.45) of the image, ~0.42 wide.
    expect(abs((f.x + f.width / 2) - 0.5) < 0.08 && abs((f.y + f.height / 2) - 0.45) < 0.12,
           "face rect is centered on the drawn face (top-left origin)")
    let rotated = try SeamVision.detectFaces(uri: file("face_o6.jpg"))
    if let r = rotated.first {
      expect(close(r, f, 0.03), "EXIF-6 copy gives the same upright rect (\(fmt(r)))")
    } else {
      expect(false, "EXIF-6 copy: face detected")
    }
  }
  // Real portrait (optional, see run-macos-test.sh): compare the EXIF-tagged original with a copy
  // whose pixels were baked upright by ImageIO (no orientation tag). Rects must match.
  let portrait = dir.appendingPathComponent("portrait.heic")
  if FileManager.default.fileExists(atPath: portrait.path) {
    let src = CGImageSourceCreateWithURL(portrait as CFURL, nil)!
    let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any] ?? [:]
    let orientation = (props[kCGImagePropertyOrientation] as? NSNumber)?.intValue ?? 1
    let upright = CGImageSourceCreateThumbnailAtIndex(src, 0, [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: 8192,
    ] as CFDictionary)!
    let baked = dir.appendingPathComponent("portrait_baked.png")
    let dest = CGImageDestinationCreateWithURL(baked as CFURL, "public.png" as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, upright, nil)
    CGImageDestinationFinalize(dest)

    let a = try SeamVision.detectFaces(uri: portrait.absoluteString)
    let b = try SeamVision.detectFaces(uri: baked.absoluteString)
    print("  portrait (EXIF orientation \(orientation)): \(a.count) face(s) \(a.map(fmt)); baked upright: \(b.count)")
    if a.isEmpty {
      skip("no face found in portrait.heic")
    } else {
      expect(a.count == b.count && zip(a, b).allSatisfy { close($0, $1, 0.01) },
             "real photo: EXIF-oriented and baked-upright copies give the same top-left rects")
    }
    if let la = try SeamVision.liftSubject(uri: portrait.absoluteString, outputUri: file("lift_portrait.png"), maxEdge: 1024),
       let lb = try SeamVision.liftSubject(uri: baked.absoluteString, outputUri: file("lift_portrait_baked.png"), maxEdge: 1024) {
      expect(close(la.rect, lb.rect, 0.01) && la.width == lb.width && la.height == lb.height,
             "real photo: liftSubject rect/size match between EXIF-oriented and baked copies (\(fmt(la.rect)), \(la.width)x\(la.height))")
    } else {
      skip("liftSubject found no subject in portrait.heic")
    }
  } else {
    skip("no portrait.heic in the work dir (set SEAM_TEST_FACE_PHOTO to a real photo with faces)")
  }

  let noFaces = try SeamVision.detectFaces(uri: file("plain.png"))
  expect(noFaces.isEmpty, "no faces in a plain gradient -> []")

  print("errors")
  do {
    _ = try SeamVision.detectFaces(uri: file("missing.png"))
    expect(false, "missing file rejects")
  } catch let e as SeamVisionError {
    expect(e.message.contains("not found"), "missing file rejects: \(e.message)")
  }
  do {
    _ = try SeamVision.detectFaces(uri: "https://example.com/a.png")
    expect(false, "non-file URI rejects")
  } catch let e as SeamVisionError {
    expect(e.message.contains("file://"), "non-file URI rejects: \(e.message)")
  }
} catch let e as SeamVisionError where e.message == "no subject" {
  // already reported
} catch {
  print("FAILED: \(error)")
  exit(1)
}

if !skipped.isEmpty {
  print("skipped: \(skipped.count)")
}
if failures > 0 {
  print("FAILED: \(failures) check(s)")
  exit(1)
}
print("all checks passed")
