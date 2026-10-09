import AVFoundation
import CoreGraphics
import CoreImage
import Foundation
import ImageIO

/// Renders one slide (interleaved image + video layers) into an H.264 MP4, then muxes audio.
/// Must be driven from a background serial queue; `run()` blocks until the file is written.
internal final class SlideVideoExporter: @unchecked Sendable {
  private enum Layer {
    case image(CGImage)
    case video(VideoLayer)
  }

  private struct VideoLayer {
    let source: VideoFrameSource
    let matrix: CGAffineTransform
    let clipPath: CGPath
    let drawRect: CGRect
    let opacity: CGFloat
  }

  private struct AudioSpec {
    let url: URL
    let start: Double
    let volume: Double
  }

  private let width: Int
  private let height: Int
  private let fps: Double
  private let duration: Double
  private let frameCount: Int
  private let layers: [Layer]
  private let audio: AudioSpec?
  private let outputURL: URL
  private let onProgress: (Double) -> Void

  /// Share of the progress bar spent on video rendering (the rest goes to audio muxing).
  private var videoProgressWeight: Double { audio == nil ? 1.0 : 0.92 }

  init(options: ExportSlideOptionsRecord, onProgress: @escaping (Double) -> Void) throws {
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
    guard options.duration.isFinite, options.duration > 0 else {
      throw SeamExportError("duration must be > 0 (got \(options.duration))")
    }
    width = options.width
    height = options.height
    fps = options.fps
    duration = options.duration
    frameCount = max(1, Int((options.duration * options.fps).rounded()))
    outputURL = try seamFileURL(from: options.outputUri, label: "outputUri")

    // Build layers bottom to top. Consecutive image parts are flattened into one bitmap
    // (source-over is associative) so each frame draws as few layers as possible.
    var built: [Layer] = []
    var pendingImages: [CGImage] = []
    func flushImages() throws {
      guard !pendingImages.isEmpty else { return }
      built.append(.image(try SlideVideoExporter.flatten(pendingImages, width: options.width, height: options.height)))
      pendingImages.removeAll()
    }

    for (index, part) in options.parts.enumerated() {
      switch part.type {
      case "image":
        let url = try seamFileURL(from: part.uri, label: "parts[\(index)].uri")
        try seamRequireReadableFile(url, label: "Image parts[\(index)]")
        pendingImages.append(try seamLoadImage(url, label: "image parts[\(index)]"))
      case "video":
        try flushImages()
        built.append(.video(try SlideVideoExporter.makeVideoLayer(part, index: index)))
      default:
        throw SeamExportError("parts[\(index)] has unknown type '\(part.type)'")
      }
    }
    try flushImages()
    layers = built

    if let a = options.audio, !a.uri.isEmpty, a.volume > 0 {
      let url = try seamFileURL(from: a.uri, label: "audio.uri")
      try seamRequireReadableFile(url, label: "Audio source")
      audio = AudioSpec(
        url: url,
        start: a.start.isFinite ? max(0, a.start) : 0,
        volume: min(max(a.volume.isFinite ? a.volume : 1, 0), 1)
      )
    } else {
      audio = nil
    }
  }

  // MARK: - Run

  /// Writes the file and returns the output URI (as a file:// string).
  func run() throws -> String {
    let fm = FileManager.default
    let tempDir = fm.temporaryDirectory
    let silentURL = tempDir.appendingPathComponent("seam-export-\(UUID().uuidString)-video.mp4")
    let muxedURL = tempDir.appendingPathComponent("seam-export-\(UUID().uuidString)-av.mp4")
    defer {
      try? fm.removeItem(at: silentURL)
      try? fm.removeItem(at: muxedURL)
    }

    try renderVideo(to: silentURL)

    var finalURL = silentURL
    if let audio, try muxAudio(audio, videoURL: silentURL, to: muxedURL) {
      finalURL = muxedURL
    }

    try fm.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    if fm.fileExists(atPath: outputURL.path) {
      try fm.removeItem(at: outputURL)
    }
    do {
      try fm.moveItem(at: finalURL, to: outputURL)
    } catch {
      try fm.copyItem(at: finalURL, to: outputURL)
    }
    return outputURL.absoluteString
  }

  // MARK: - Video

  private func renderVideo(to url: URL) throws {
    let encoder = SeamVideoEncoder(width: width, height: height, fps: fps, averageBitRate: 12_000_000)
    let weight = videoProgressWeight
    let report = onProgress
    let fps = self.fps
    try encoder.encode(
      frameCount: frameCount,
      to: url,
      progress: { report(weight * $0) },
      draw: { [self] index, ctx in
        try composite(into: ctx, at: Double(index) / fps)
      }
    )
  }

  /// Draws the slide at time `t` into a flipped (y-down, output-pixel) context.
  private func composite(into ctx: CGContext, at t: Double) throws {
    let fullFrame = CGRect(x: 0, y: 0, width: width, height: height)
    // Pool buffers are recycled: start from opaque black every frame.
    ctx.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
    ctx.fill(fullFrame)

    for layer in layers {
      switch layer {
      case .image(let image):
        seamDrawUpright(image, in: fullFrame, context: ctx)
      case .video(let video):
        guard let frame = try video.source.image(at: t) else { continue }
        ctx.saveGState()
        ctx.concatenate(video.matrix)
        ctx.addPath(video.clipPath)
        ctx.clip()
        ctx.setAlpha(video.opacity)
        seamDrawUpright(frame, in: video.drawRect, context: ctx)
        ctx.restoreGState()
      }
    }
  }

  // MARK: - Layer setup

  private static func makeVideoLayer(_ part: SlidePartRecord, index: Int) throws -> VideoLayer {
    let url = try seamFileURL(from: part.uri, label: "parts[\(index)].uri")
    try seamRequireReadableFile(url, label: "Video parts[\(index)]")

    guard part.matrix.count == 6, part.matrix.allSatisfy({ $0.isFinite }) else {
      throw SeamExportError("parts[\(index)].matrix must be 6 finite numbers [a, b, c, d, tx, ty]")
    }
    let m = part.matrix.map { CGFloat($0) }
    let matrix = CGAffineTransform(a: m[0], b: m[1], c: m[2], d: m[3], tx: m[4], ty: m[5])

    let frameRect: CGRect
    if let fr = part.frameRect {
      guard [fr.x, fr.y, fr.width, fr.height].allSatisfy({ $0.isFinite }) else {
        throw SeamExportError("parts[\(index)].frameRect must be 4 finite numbers")
      }
      frameRect = CGRect(x: fr.x, y: fr.y, width: fr.width, height: fr.height).standardized
    } else {
      let frameWidth = CGFloat(part.frameWidth.isFinite ? max(0, part.frameWidth) : 0)
      let frameHeight = CGFloat(part.frameHeight.isFinite ? max(0, part.frameHeight) : 0)
      frameRect = CGRect(x: -frameWidth / 2, y: -frameHeight / 2, width: frameWidth, height: frameHeight)
    }
    let shape = try SeamClipShape.parse(part.clip, label: "parts[\(index)].clip")
    let clipPath = shape.path(in: frameRect, cornerRadius: CGFloat(part.cornerRadius))

    let r = part.drawRect
    let drawRect = CGRect(x: r.x, y: r.y, width: r.width, height: r.height).standardized

    let colorMatrix: [Double]?
    if let cm = part.colorMatrix {
      guard cm.count == 20, cm.allSatisfy({ $0.isFinite }) else {
        throw SeamExportError("parts[\(index)].colorMatrix must have 20 finite numbers (got \(cm.count))")
      }
      colorMatrix = cm
    } else {
      colorMatrix = nil
    }

    let source = try VideoFrameSource(url: url, start: part.start, length: part.length, colorMatrix: colorMatrix)

    // Only decode/convert at the resolution the layer is actually drawn at (plus a little margin).
    let scaleX = hypot(matrix.a, matrix.b)
    let scaleY = hypot(matrix.c, matrix.d)
    let neededW = drawRect.width * max(scaleX, scaleY) * 1.05
    let neededH = drawRect.height * max(scaleX, scaleY) * 1.05
    if neededW > 0, neededH > 0 {
      source.limitRenderSize(to: CGSize(width: neededW, height: neededH))
    }

    return VideoLayer(
      source: source,
      matrix: matrix,
      clipPath: clipPath,
      drawRect: drawRect,
      opacity: CGFloat(min(max(part.opacity.isFinite ? part.opacity : 1, 0), 1))
    )
  }

  /// Composites full-frame images (bottom to top) into one premultiplied BGRA bitmap.
  private static func flatten(_ images: [CGImage], width: Int, height: Int) throws -> CGImage {
    let ctx = try seamMakeBitmapContext(width: width, height: height, label: "the image layers")
    ctx.interpolationQuality = .high
    let rect = CGRect(x: 0, y: 0, width: width, height: height)
    ctx.clear(rect)
    // Unflipped context: CGContext.draw renders images upright here.
    for image in images {
      ctx.draw(image, in: rect)
    }
    guard let flattened = ctx.makeImage() else {
      throw SeamExportError("Cannot flatten image layers")
    }
    return flattened
  }

  // MARK: - Audio

  /// Muxes the source audio under the rendered video. Returns false when there is no usable
  /// audio (no audio track / empty range), in which case the silent video is used as-is.
  private func muxAudio(_ audio: AudioSpec, videoURL: URL, to outURL: URL) throws -> Bool {
    let audioAsset = AVURLAsset(url: audio.url, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
    let audioTracks: [AVAssetTrack]
    do {
      audioTracks = try seamAwait { try await audioAsset.loadTracks(withMediaType: .audio) }
    } catch {
      throw SeamExportError("Cannot read audio from \(audio.url.lastPathComponent): \(error.localizedDescription)")
    }
    guard let audioTrack = audioTracks.first else {
      return false
    }
    let audioRange = try seamAwait { try await audioTrack.load(.timeRange) }
    let sourceStart = max(audio.start, audioRange.start.seconds)
    let sourceEnd = min(audio.start + duration, audioRange.end.seconds)
    guard sourceEnd - sourceStart > 0.02 else {
      return false
    }

    let videoAsset = AVURLAsset(url: videoURL, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
    let videoTracks = try seamAwait { try await videoAsset.loadTracks(withMediaType: .video) }
    guard let videoTrack = videoTracks.first else {
      throw SeamExportError("Rendered video has no video track")
    }
    let videoRange = try seamAwait { try await videoTrack.load(.timeRange) }

    let composition = AVMutableComposition()
    guard
      let compVideo = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
      let compAudio = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
    else {
      throw SeamExportError("Cannot create composition tracks")
    }
    do {
      try compVideo.insertTimeRange(videoRange, of: videoTrack, at: .zero)
      // Audio from [start, start + duration] (clamped to the source); silence after.
      let audioInsert = CMTimeRange(start: seamTime(sourceStart), end: seamTime(sourceEnd))
      try compAudio.insertTimeRange(audioInsert, of: audioTrack, at: .zero)
    } catch {
      throw SeamExportError("Cannot build the audio composition: \(error.localizedDescription)")
    }

    let params = AVMutableAudioMixInputParameters(track: compAudio)
    params.setVolume(Float(audio.volume), at: .zero)
    let audioMix = AVMutableAudioMix()
    audioMix.inputParameters = [params]

    // Passthrough keeps the rendered H.264 untouched but cannot apply a volume change,
    // so it's only used at full volume. Otherwise (or if passthrough fails, e.g. the source
    // audio codec isn't MP4-compatible) re-encode with the highest-quality preset.
    var lastError: String = "unknown error"
    var presets: [String] = []
    if audio.volume >= 0.999 {
      presets.append(AVAssetExportPresetPassthrough)
    }
    presets.append(AVAssetExportPresetHighestQuality)

    for preset in presets {
      try? FileManager.default.removeItem(at: outURL)
      guard let session = AVAssetExportSession(asset: composition, presetName: preset) else {
        lastError = "export preset \(preset) unavailable"
        continue
      }
      guard session.supportedFileTypes.contains(.mp4) else {
        lastError = "export preset \(preset) cannot write MP4"
        continue
      }
      if preset != AVAssetExportPresetPassthrough {
        session.audioMix = audioMix
      }
      session.shouldOptimizeForNetworkUse = true
      do {
        try runExport(session, to: outURL)
        onProgress(1)
        return true
      } catch {
        lastError = (error as? SeamExportError)?.message ?? error.localizedDescription
      }
    }
    throw SeamExportError("Adding audio failed: \(lastError)")
  }

  private func runExport(_ session: AVAssetExportSession, to url: URL) throws {
    let progressBase = videoProgressWeight
    let report = onProgress
    if #available(iOS 18.0, *) {
      let box = SeamBox(session)
      try seamAwait {
        try await box.value.export(to: url, as: .mp4)
      }
    } else {
      session.outputURL = url
      session.outputFileType = .mp4
      let done = DispatchSemaphore(value: 0)
      session.exportAsynchronously { done.signal() }
      while done.wait(timeout: .now() + .milliseconds(200)) == .timedOut {
        report(progressBase + (1 - progressBase) * Double(session.progress))
      }
      guard session.status == .completed else {
        throw SeamExportError(session.error?.localizedDescription ?? "export status \(session.status.rawValue)")
      }
    }
  }
}
