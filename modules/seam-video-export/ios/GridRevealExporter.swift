import CoreGraphics
import Foundation
import ImageIO

/// A Reel of a grid puzzle coming together: an empty profile grid, then each tile drops in,
/// in posting order, until the full picture is there. Optional soundtrack.
internal final class GridRevealExporter: @unchecked Sendable {
  private let width: Int
  private let height: Int
  private let fps: Double
  private let step: Double
  private let hold: Double
  private let intro = 0.5
  private let landing = 0.5
  private let columns: Int
  private let rows: Int
  private let order: [Int]
  private let tiles: [CGImage]
  private let rects: [CGRect]
  private let background: SeamColor
  private let frameCount: Int
  private let audio: (url: URL, start: Double, volume: Double)?
  private let outputURL: URL
  private let onProgress: (Double) -> Void

  init(options: GridRevealOptionsRecord, onProgress: @escaping (Double) -> Void) throws {
    self.onProgress = onProgress
    guard options.width > 0, options.height > 0, options.width <= 4096, options.height <= 4096 else {
      throw SeamExportError("Output size \(options.width)x\(options.height) is out of range")
    }
    guard options.columns > 0, options.rows > 0, options.tiles.count == options.columns * options.rows else {
      throw SeamExportError("Expected \(options.columns * options.rows) tiles, got \(options.tiles.count)")
    }
    guard options.fps.isFinite, options.fps > 0, options.fps <= 120 else {
      throw SeamExportError("fps must be in (0, 120]")
    }
    width = options.width
    height = options.height
    fps = options.fps
    step = max(0.05, options.step.isFinite ? options.step : 0.4)
    hold = max(0.5, options.hold.isFinite ? options.hold : 2.5)
    columns = options.columns
    rows = options.rows
    background = try SeamColor.parse(options.background, label: "background")
    outputURL = try seamFileURL(from: options.outputUri, label: "outputUri")

    let n = options.tiles.count
    let valid = options.order.filter { $0 >= 0 && $0 < n }
    order = Set(valid).count == n ? valid : Array((0..<n).reversed())

    var images: [CGImage] = []
    for (i, uri) in options.tiles.enumerated() {
      let url = try seamFileURL(from: uri, label: "tiles[\(i)]")
      try seamRequireReadableFile(url, label: "Tile \(i + 1)")
      images.append(try seamLoadImage(url, label: "tiles[\(i)]"))
    }
    tiles = images

    // The grid fills the width (with a margin) and sits a little above the middle, like a profile.
    let gap = CGFloat(max(0, options.gap))
    let margin = CGFloat(width) * 0.06
    let tileW = (CGFloat(width) - margin * 2 - gap * CGFloat(columns - 1)) / CGFloat(columns)
    let aspect = CGFloat(images[0].height) / CGFloat(max(1, images[0].width))
    var tileH = tileW * aspect
    var gridH = tileH * CGFloat(rows) + gap * CGFloat(rows - 1)
    let maxH = CGFloat(height) * 0.8
    var tw = tileW
    if gridH > maxH {
      let k = maxH / gridH
      tw *= k
      tileH *= k
      gridH = maxH
    }
    let gridW = tw * CGFloat(columns) + gap * CGFloat(columns - 1)
    let x0 = (CGFloat(width) - gridW) / 2
    let y0 = (CGFloat(height) - gridH) / 2 - CGFloat(height) * 0.03
    rects = (0..<n).map { i in
      let c = CGFloat(i % options.columns)
      let r = CGFloat(i / options.columns)
      return CGRect(x: (x0 + c * (tw + gap)).rounded(), y: (y0 + r * (tileH + gap)).rounded(), width: tw.rounded(), height: tileH.rounded())
    }

    let total = intro + Double(n - 1) * step + landing + hold
    frameCount = max(1, Int((total * fps).rounded()))
    if let a = options.audio, !a.uri.isEmpty, a.volume > 0 {
      let url = try seamFileURL(from: a.uri, label: "audio.uri")
      try seamRequireReadableFile(url, label: "Audio source")
      audio = (url, max(0, a.start), a.volume)
    } else {
      audio = nil
    }
  }

  func run() throws -> String {
    let fm = FileManager.default
    let tempURL = fm.temporaryDirectory.appendingPathComponent("seam-grid-\(UUID().uuidString).mp4")
    let muxedURL = fm.temporaryDirectory.appendingPathComponent("seam-grid-\(UUID().uuidString)-av.mp4")
    defer {
      try? fm.removeItem(at: tempURL)
      try? fm.removeItem(at: muxedURL)
    }
    let encoder = SeamVideoEncoder(width: width, height: height, fps: fps, averageBitRate: 10_000_000)
    let report = onProgress
    let weight = audio == nil ? 1.0 : 0.9
    let fps = self.fps
    try encoder.encode(
      frameCount: frameCount,
      to: tempURL,
      progress: { report($0 * weight) },
      draw: { [self] index, ctx in drawFrame(at: Double(index) / fps, into: ctx) }
    )
    var finalURL = tempURL
    if let audio, try seamMuxSoundtrack(audioURL: audio.url, start: audio.start, volume: audio.volume, videoURL: tempURL, to: muxedURL) {
      finalURL = muxedURL
    }
    try seamReplaceItem(at: outputURL, with: finalURL)
    return outputURL.absoluteString
  }

  /// Overshooting ease-out: the tile lands slightly big and settles.
  private static func easeOutBack(_ p: Double) -> Double {
    let x = min(max(p, 0), 1)
    let c1 = 1.70158
    let c3 = c1 + 1
    return 1 + c3 * pow(x - 1, 3) + c1 * pow(x - 1, 2)
  }

  private func drawFrame(at t: Double, into ctx: CGContext) {
    let frame = CGRect(x: 0, y: 0, width: width, height: height)
    ctx.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
    ctx.fill(frame)
    ctx.setFillColor(background.cgColor)
    ctx.fill(frame)

    // Once everything has landed, a gentle push-in on the finished picture.
    let n = tiles.count
    let done = intro + Double(n - 1) * step + landing
    if t > done {
      let p = min(1, (t - done) / hold)
      let s = CGFloat(1 + 0.04 * (1 - pow(1 - p, 2)))
      ctx.translateBy(x: frame.midX, y: frame.midY)
      ctx.scaleBy(x: s, y: s)
      ctx.translateBy(x: -frame.midX, y: -frame.midY)
    }

    // Empty slots waiting for their post.
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 0.06))
    for rect in rects {
      ctx.fill(rect)
    }

    for (k, index) in order.enumerated() {
      let start = intro + Double(k) * step
      guard t >= start else { continue }
      let p = min(1, (t - start) / landing)
      let scale = CGFloat(0.82 + 0.18 * GridRevealExporter.easeOutBack(p))
      let alpha = CGFloat(min(1, p * 2.2))
      let rect = rects[index]
      let drawn = CGRect(
        x: rect.midX - rect.width * scale / 2,
        y: rect.midY - rect.height * scale / 2,
        width: rect.width * scale,
        height: rect.height * scale
      )
      ctx.saveGState()
      ctx.setAlpha(alpha)
      ctx.clip(to: rect.insetBy(dx: -rect.width * 0.1, dy: -rect.height * 0.1))
      seamDrawUpright(tiles[index], in: drawn, context: ctx)
      ctx.restoreGState()
    }
  }
}
