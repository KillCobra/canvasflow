import CoreGraphics
import Foundation
import ImageIO

/// Renders a silent "swipe preview" MP4 that pans across the carousel slides like a finger
/// swiping through it: hold on slide 0, ease to slide 1, hold, ..., hold on the last slide.
/// Must be driven from a background serial queue; `run()` blocks until the file is written.
internal final class PanVideoExporter: @unchecked Sendable {
  private struct Dots {
    let centers: [CGPoint]
    let diameter: CGFloat
    let color: SeamColor
    let activeColor: SeamColor
  }

  private let width: Int
  private let height: Int
  private let fps: Double
  private let hold: Double
  private let move: Double
  private let frameCount: Int
  private let slideURLs: [URL]
  /// The slide viewport snapped to whole output pixels (top-left origin, y down). Slides are
  /// drawn 1:1 at integer offsets so they stay crisp and abut without a seam.
  private let window: CGRect
  private let windowClip: CGPath
  /// Background color + optional background image, pre-rendered at output size.
  private let base: CGImage
  private let dots: Dots?
  private let outputURL: URL
  private let onProgress: (Double) -> Void

  /// Decoded slides (normalized to the window's pixel size); only the visible ones are kept,
  /// so memory stays flat regardless of the slide count. Touched only on the render queue.
  private var slideCache: [Int: CGImage] = [:]

  init(options: PanVideoOptionsRecord, onProgress: @escaping (Double) -> Void) throws {
    self.onProgress = onProgress

    guard options.width > 0, options.height > 0 else {
      throw SeamExportError("width/height must be positive (got \(options.width)x\(options.height))")
    }
    guard options.width <= 8192, options.height <= 8192 else {
      throw SeamExportError("Output size \(options.width)x\(options.height) is too large")
    }
    guard options.fps.isFinite, options.fps > 0, options.fps <= 240 else {
      throw SeamExportError("fps must be in (0, 240] (got \(options.fps))")
    }
    guard options.hold.isFinite, options.hold >= 0 else {
      throw SeamExportError("hold must be >= 0 seconds (got \(options.hold))")
    }
    guard options.move.isFinite, options.move >= 0 else {
      throw SeamExportError("move must be >= 0 seconds (got \(options.move))")
    }
    guard !options.slides.isEmpty else {
      throw SeamExportError("slides is empty: pass at least one slide image")
    }
    width = options.width
    height = options.height
    fps = options.fps
    hold = options.hold
    move = options.move

    let n = options.slides.count
    let total = Double(n) * hold + Double(n - 1) * move
    guard total > 0 else {
      throw SeamExportError("Nothing to render: total duration n*hold + (n-1)*move is 0")
    }
    guard total <= 600 else {
      throw SeamExportError("Swipe video would be \(Int(total))s long; the limit is 600s")
    }
    frameCount = max(1, Int((total * fps).rounded()))
    outputURL = try seamFileURL(from: options.outputUri, label: "outputUri")

    let w = options.window
    guard [w.x, w.y, w.width, w.height].allSatisfy({ $0.isFinite }), w.width >= 1, w.height >= 1 else {
      throw SeamExportError("window must have a finite position and a size of at least 1x1 px (got \(w.width)x\(w.height))")
    }
    let win = CGRect(
      x: w.x.rounded(),
      y: w.y.rounded(),
      width: max(1, w.width.rounded()),
      height: max(1, w.height.rounded())
    )
    window = win
    let radius = CGFloat(options.cornerRadius.isFinite ? options.cornerRadius : 0)
    windowClip = SeamClipShape.roundedRect.path(in: win, cornerRadius: radius)

    // Validate every slide up front (cheap: header only) so a bad file fails before encoding.
    var urls: [URL] = []
    for (index, uri) in options.slides.enumerated() {
      let label = "slides[\(index)]"
      let url = try seamFileURL(from: uri, label: label)
      try seamRequireReadableFile(url, label: "Slide image \(label)")
      guard
        let source = CGImageSourceCreateWithURL(url as CFURL, nil),
        CGImageSourceGetCount(source) > 0,
        let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
        let pw = (props[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue, pw > 0,
        let ph = (props[kCGImagePropertyPixelHeight] as? NSNumber)?.intValue, ph > 0
      else {
        throw SeamExportError("Slide image \(label) (\(url.lastPathComponent)) is not a readable image")
      }
      urls.append(url)
    }
    slideURLs = urls

    base = try PanVideoExporter.makeBase(options: options, width: options.width, height: options.height)

    if let d = options.dots {
      guard [d.y, d.size, d.gap].allSatisfy({ $0.isFinite }), d.size > 0, d.gap >= 0 else {
        throw SeamExportError("dots needs a finite y, size > 0 and gap >= 0")
      }
      let size = CGFloat(d.size)
      let gap = CGFloat(d.gap)
      let rowWidth = CGFloat(n) * size + CGFloat(n - 1) * gap
      // Centered under the window (which is normally centered in the frame).
      let startX = win.midX - rowWidth / 2 + size / 2
      dots = Dots(
        centers: (0..<n).map { CGPoint(x: startX + CGFloat($0) * (size + gap), y: CGFloat(d.y)) },
        diameter: size,
        color: try SeamColor.parse(d.color, label: "dots.color"),
        activeColor: try SeamColor.parse(d.activeColor, label: "dots.activeColor")
      )
    } else {
      dots = nil
    }
  }

  // MARK: - Run

  /// Writes the file and returns the output URI (as a file:// string).
  func run() throws -> String {
    let fm = FileManager.default
    let tempURL = fm.temporaryDirectory.appendingPathComponent("seam-pan-\(UUID().uuidString).mp4")
    defer {
      try? fm.removeItem(at: tempURL)
      slideCache.removeAll()
    }

    let encoder = SeamVideoEncoder(width: width, height: height, fps: fps, averageBitRate: 12_000_000)
    let report = onProgress
    let fps = self.fps
    try encoder.encode(
      frameCount: frameCount,
      to: tempURL,
      progress: { report($0) },
      draw: { [self] index, ctx in
        try drawFrame(at: Double(index) / fps, into: ctx)
      }
    )

    try fm.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    if fm.fileExists(atPath: outputURL.path) {
      try fm.removeItem(at: outputURL)
    }
    do {
      try fm.moveItem(at: tempURL, to: outputURL)
    } catch {
      try fm.copyItem(at: tempURL, to: outputURL)
    }
    return outputURL.absoluteString
  }

  // MARK: - Timeline

  /// Which slide is showing at time `t`, and how far (0..<1, linear) the swipe to the next one is.
  static func position(at t: Double, count n: Int, hold: Double, move: Double) -> (index: Int, progress: Double) {
    guard n > 1 else { return (0, 0) }
    let period = hold + move
    guard period > 0 else { return (n - 1, 0) }
    let k = max(0, Int((t / period).rounded(.down)))
    if k >= n - 1 { return (n - 1, 0) }
    let local = t - Double(k) * period
    if local < hold || move <= 0 { return (k, 0) }
    let p = (local - hold) / move
    if p >= 1 { return (k + 1, 0) }
    return (k, max(0, p))
  }

  /// Swipe-like ease-in-out (cubic).
  static func ease(_ p: Double) -> Double {
    let x = min(max(p, 0), 1)
    return x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2
  }

  // MARK: - Drawing

  private func drawFrame(at t: Double, into ctx: CGContext) throws {
    let n = slideURLs.count
    let (index, linear) = PanVideoExporter.position(at: t, count: n, hold: hold, move: move)
    let eased = PanVideoExporter.ease(linear)

    // Base covers every pixel (pool buffers are recycled).
    seamDrawUpright(base, in: CGRect(x: 0, y: 0, width: width, height: height), context: ctx)

    // Drop slides that can't be visible any more (the timeline only moves forward).
    for key in slideCache.keys where key < index || key > index + 1 {
      slideCache[key] = nil
    }

    // Whole-pixel shift keeps both slides crisp and makes them abut exactly at the seam.
    let shift = (eased * Double(window.width)).rounded()
    ctx.saveGState()
    ctx.addPath(windowClip)
    ctx.clip()
    ctx.interpolationQuality = .none
    let current = try slide(index)
    seamDrawUpright(current, in: window.offsetBy(dx: -CGFloat(shift), dy: 0), context: ctx)
    if shift > 0, index + 1 < n {
      let next = try slide(index + 1)
      seamDrawUpright(next, in: window.offsetBy(dx: window.width - CGFloat(shift), dy: 0), context: ctx)
    }
    ctx.restoreGState()

    if let dots {
      let active = Double(index) + eased
      for (j, center) in dots.centers.enumerated() {
        let activeness = CGFloat(max(0, 1 - abs(active - Double(j))))
        ctx.setFillColor(dots.color.mixed(with: dots.activeColor, activeness).cgColor)
        ctx.fillEllipse(in: CGRect(
          x: center.x - dots.diameter / 2,
          y: center.y - dots.diameter / 2,
          width: dots.diameter,
          height: dots.diameter
        ))
      }
    }
  }

  /// Decodes slide `index` once, normalized to the window's pixel size (BGRA, premultiplied).
  private func slide(_ index: Int) throws -> CGImage {
    if let cached = slideCache[index] {
      return cached
    }
    let w = Int(window.width)
    let h = Int(window.height)
    let normalized: CGImage = try autoreleasepool {
      let decoded = try seamLoadImage(slideURLs[index], label: "slide image slides[\(index)]")
      let ctx = try seamMakeBitmapContext(width: w, height: h, label: "slides[\(index)]")
      ctx.interpolationQuality = .high
      // Unflipped context: CGContext.draw renders images upright here. Slides are expected to be
      // exactly window-sized; anything else is stretched to fill the window.
      ctx.draw(decoded, in: CGRect(x: 0, y: 0, width: w, height: h))
      guard let image = ctx.makeImage() else {
        throw SeamExportError("Cannot prepare slides[\(index)]")
      }
      return image
    }
    slideCache[index] = normalized
    return normalized
  }

  private static func makeBase(options: PanVideoOptionsRecord, width: Int, height: Int) throws -> CGImage {
    let background = try SeamColor.parse(options.background, label: "background")
    let ctx = try seamMakeBitmapContext(width: width, height: height, label: "the background")
    let frame = CGRect(x: 0, y: 0, width: width, height: height)
    // The video is opaque: composite a translucent background color over black.
    ctx.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
    ctx.fill(frame)
    ctx.setFillColor(background.cgColor)
    ctx.fill(frame)

    if let uri = options.backgroundImage, !uri.isEmpty {
      let url = try seamFileURL(from: uri, label: "backgroundImage")
      try seamRequireReadableFile(url, label: "Background image")
      let image = try seamLoadImage(url, label: "backgroundImage")
      // Aspect-fill, centered (symmetric, so the unflipped context doesn't matter).
      let iw = CGFloat(image.width)
      let ih = CGFloat(image.height)
      let scale = max(frame.width / iw, frame.height / ih)
      let drawSize = CGSize(width: iw * scale, height: ih * scale)
      ctx.interpolationQuality = .high
      ctx.draw(image, in: CGRect(
        x: (frame.width - drawSize.width) / 2,
        y: (frame.height - drawSize.height) / 2,
        width: drawSize.width,
        height: drawSize.height
      ))
    }
    guard let image = ctx.makeImage() else {
      throw SeamExportError("Cannot prepare the background")
    }
    return image
  }
}
