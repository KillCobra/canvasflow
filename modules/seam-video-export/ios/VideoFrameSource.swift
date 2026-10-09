import AVFoundation
import CoreImage
import CoreImage.CIFilterBuiltins
import Foundation

/// Sequentially decodes one video clip with AVAssetReader and hands out upright,
/// optionally color-matrixed CGImages for monotonically increasing output times.
///
/// Timing model: for slide time `t`, the wanted source time is `start + (t mod length)`.
/// We show the latest decoded sample whose PTS <= that time. When `t` crosses into a new
/// loop iteration the reader is recreated at `start`. If the source runs out before
/// `start + length`, the last decoded frame is held until the loop wraps.
internal final class VideoFrameSource {
  private let url: URL
  private let asset: AVURLAsset
  private let track: AVAssetTrack
  private let clipStart: Double
  private let clipLength: Double
  private let readRange: CMTimeRange

  /// Linear part of `preferredTransform`, converted from AVFoundation's y-down space to
  /// CoreImage's y-up space (conjugated by a y-flip).
  private let ciOrientation: CGAffineTransform

  /// Upright (display) size of a frame, in pixels.
  let displaySize: CGSize

  /// Pixel size the converted frame is rendered at (<= displaySize; downscaled when the
  /// layer is drawn smaller than the source to save memory/bandwidth).
  private var targetSize: CGSize
  private let colorMatrix: [CGFloat]?

  private var reader: AVAssetReader?
  private var output: AVAssetReaderTrackOutput?
  private var exhausted = false
  private var currentLoop = -1

  /// Next decoded sample not yet shown (PTS > last requested time).
  private var pending: CMSampleBuffer?
  /// Sample chosen for display but not yet converted to a CGImage.
  private var chosen: CMSampleBuffer?
  private(set) var currentImage: CGImage?
  private var hasCurrent = false

  /// Tolerance for PTS comparisons (absorbs timescale rounding, e.g. 29.97 vs 30 fps).
  private let epsilon = 0.001

  init(url: URL, start: Double, length: Double, colorMatrix: [Double]?) throws {
    self.url = url
    let asset = AVURLAsset(url: url, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
    self.asset = asset

    let tracks = try seamAwait { try await asset.loadTracks(withMediaType: .video) }
    guard let track = tracks.first else {
      throw SeamExportError("No video track in \(url.lastPathComponent)")
    }
    self.track = track

    let (transform, naturalSize, timeRange) = try seamAwait {
      try await track.load(.preferredTransform, .naturalSize, .timeRange)
    }

    let videoStart = timeRange.start.isNumeric ? timeRange.start.seconds : 0
    var videoEnd = timeRange.end.isNumeric ? timeRange.end.seconds : 0
    if videoEnd <= videoStart {
      let duration = try seamAwait { try await asset.load(.duration) }
      videoEnd = duration.isNumeric ? duration.seconds : 0
    }

    var s = start.isFinite ? start : 0
    s = max(s, videoStart)
    // Keep the start inside the clip so we always decode at least one frame.
    if videoEnd > videoStart {
      s = min(s, max(videoStart, videoEnd - 0.05))
    }
    self.clipStart = s
    if length.isFinite && length > 0 {
      self.clipLength = length
    } else {
      self.clipLength = max(videoEnd - s, 0)
    }
    // Read from `start` until the end of the clip (or the asset, whichever is first).
    if clipLength > 0 && (videoEnd <= videoStart || s + clipLength < videoEnd) {
      self.readRange = CMTimeRange(start: seamTime(s), duration: seamTime(clipLength))
    } else {
      self.readRange = CMTimeRange(start: seamTime(s), duration: .positiveInfinity)
    }

    // Upright size per the transform's linear part.
    let linear = CGAffineTransform(a: transform.a, b: transform.b, c: transform.c, d: transform.d, tx: 0, ty: 0)
    let uprightRect = CGRect(origin: .zero, size: naturalSize).applying(linear)
    self.displaySize = CGSize(width: abs(uprightRect.width).rounded(), height: abs(uprightRect.height).rounded())
    self.ciOrientation = CGAffineTransform(
      a: transform.a, b: -transform.b, c: -transform.c, d: transform.d, tx: 0, ty: 0
    )
    self.targetSize = displaySize

    if let m = colorMatrix, m.count == 20, !VideoFrameSource.isIdentity(m) {
      self.colorMatrix = m.map { CGFloat($0) }
    } else {
      self.colorMatrix = nil
    }

    if displaySize.width < 1 || displaySize.height < 1 {
      throw SeamExportError("Video \(url.lastPathComponent) has an invalid size \(naturalSize)")
    }
  }

  deinit {
    reader?.cancelReading()
  }

  /// Caps the converted frame size to `maxPixelSize` (aspect preserved; never upscales).
  func limitRenderSize(to maxPixelSize: CGSize) {
    guard maxPixelSize.width > 0, maxPixelSize.height > 0 else { return }
    let scale = min(1, max(maxPixelSize.width / displaySize.width, maxPixelSize.height / displaySize.height))
    targetSize = CGSize(
      width: max(1, (displaySize.width * scale).rounded()),
      height: max(1, (displaySize.height * scale).rounded())
    )
  }

  /// Returns the frame to show at slide time `t` (seconds). `t` must not decrease between calls.
  func image(at t: Double) throws -> CGImage? {
    var loop = 0
    var local = t
    if clipLength > 0 {
      loop = Int((t / clipLength).rounded(.down))
      local = t - Double(loop) * clipLength
      if local < 0 { local = 0 }
    }
    let target = clipStart + local

    if loop != currentLoop {
      try startReader()
      currentLoop = loop
      pending = try readNext()
      hasCurrent = false
      chosen = nil
    }

    // First frame of a (re)started reader: show it even if its PTS is slightly after `target`.
    if !hasCurrent, let first = pending {
      chosen = first
      hasCurrent = true
      pending = try readNext()
    }

    while let next = pending, CMSampleBufferGetPresentationTimeStamp(next).seconds <= target + epsilon {
      chosen = next
      pending = try readNext()
    }

    if let sample = chosen {
      chosen = nil
      if let pixelBuffer = CMSampleBufferGetImageBuffer(sample) {
        currentImage = try makeImage(from: pixelBuffer)
      }
    }
    // If nothing new was chosen (or the clip ran out), the previous image is held.
    return currentImage
  }

  // MARK: - Reader

  private func startReader() throws {
    reader?.cancelReading()
    reader = nil
    output = nil
    exhausted = false

    let newReader: AVAssetReader
    do {
      newReader = try AVAssetReader(asset: asset)
    } catch {
      throw SeamExportError("Cannot open \(url.lastPathComponent) for reading: \(error.localizedDescription)")
    }
    let settings: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
      // Convert (and tone map HDR/HLG/P3 sources) to the Rec.709 SDR space we encode in.
      AVVideoColorPropertiesKey: [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
      ],
    ]
    let newOutput = AVAssetReaderTrackOutput(track: track, outputSettings: settings)
    newOutput.alwaysCopiesSampleData = false
    guard newReader.canAdd(newOutput) else {
      throw SeamExportError("Cannot decode video track of \(url.lastPathComponent)")
    }
    newReader.add(newOutput)
    newReader.timeRange = readRange
    guard newReader.startReading() else {
      let reason = newReader.error?.localizedDescription ?? "unknown error"
      throw SeamExportError("Cannot start decoding \(url.lastPathComponent): \(reason)")
    }
    reader = newReader
    output = newOutput
  }

  private func readNext() throws -> CMSampleBuffer? {
    guard !exhausted, let reader, let output else { return nil }
    while true {
      if let sample = output.copyNextSampleBuffer() {
        if CMSampleBufferGetNumSamples(sample) > 0, CMSampleBufferGetImageBuffer(sample) != nil {
          return sample
        }
        continue
      }
      if reader.status == .failed {
        let reason = reader.error?.localizedDescription ?? "unknown error"
        throw SeamExportError("Decoding \(url.lastPathComponent) failed: \(reason)")
      }
      exhausted = true
      return nil
    }
  }

  // MARK: - Conversion

  private func makeImage(from pixelBuffer: CVPixelBuffer) throws -> CGImage {
    var image = CIImage(cvPixelBuffer: pixelBuffer, options: [.colorSpace: NSNull()])

    // Rotate/flip upright, then move the extent back to the origin.
    if ciOrientation != .identity {
      image = image.transformed(by: ciOrientation)
    }
    let extent = image.extent
    if extent.origin != .zero {
      image = image.transformed(by: CGAffineTransform(translationX: -extent.minX, y: -extent.minY))
    }

    let uprightSize = image.extent.size
    let outSize = CGSize(
      width: min(targetSize.width, uprightSize.width.rounded()),
      height: min(targetSize.height, uprightSize.height.rounded())
    )
    let outRect = CGRect(origin: .zero, size: outSize)

    if outSize.width < uprightSize.width - 0.5 || outSize.height < uprightSize.height - 0.5 {
      let scaleY = outSize.height / uprightSize.height
      let scaleX = outSize.width / uprightSize.width
      let lanczos = CIFilter.lanczosScaleTransform()
      lanczos.inputImage = image.clampedToExtent()
      lanczos.scale = Float(scaleY)
      lanczos.aspectRatio = Float(scaleX / scaleY)
      if let scaled = lanczos.outputImage {
        image = scaled
      }
    }

    if let m = colorMatrix {
      let matrix = CIFilter.colorMatrix()
      matrix.inputImage = image
      matrix.rVector = CIVector(x: m[0], y: m[1], z: m[2], w: m[3])
      matrix.gVector = CIVector(x: m[5], y: m[6], z: m[7], w: m[8])
      matrix.bVector = CIVector(x: m[10], y: m[11], z: m[12], w: m[13])
      matrix.aVector = CIVector(x: m[15], y: m[16], z: m[17], w: m[18])
      matrix.biasVector = CIVector(x: m[4], y: m[9], z: m[14], w: m[19])
      let clamp = CIFilter.colorClamp()
      clamp.inputImage = matrix.outputImage
      clamp.minComponents = CIVector(x: 0, y: 0, z: 0, w: 0)
      clamp.maxComponents = CIVector(x: 1, y: 1, z: 1, w: 1)
      if let out = clamp.outputImage {
        image = out
      }
    }

    image = image.cropped(to: outRect)

    guard let cgImage = SeamGraphics.ciContext.createCGImage(
      image, from: outRect, format: .BGRA8, colorSpace: SeamGraphics.sRGB
    ) else {
      throw SeamExportError("Failed to convert a frame of \(url.lastPathComponent)")
    }
    return cgImage
  }

  private static func isIdentity(_ m: [Double]) -> Bool {
    let identity: [Double] = [
      1, 0, 0, 0, 0,
      0, 1, 0, 0, 0,
      0, 0, 1, 0, 0,
      0, 0, 0, 1, 0,
    ]
    for i in 0..<20 where abs(m[i] - identity[i]) > 1e-6 {
      return false
    }
    return true
  }
}
