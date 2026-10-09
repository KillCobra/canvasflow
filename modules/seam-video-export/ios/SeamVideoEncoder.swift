import AVFoundation
import CoreGraphics
import Foundation

/// Encodes CPU-drawn frames into a silent H.264 MP4 with AVAssetWriter.
///
/// `encode` blocks until the file is written; drive it from a background serial queue (never the
/// main/JS thread). Frames are drawn into recycled BGRA pixel buffers through a CGContext that is
/// already flipped to the top-left / y-down output-pixel space, so `draw` must cover every pixel.
internal final class SeamVideoEncoder: @unchecked Sendable {
  let width: Int
  let height: Int
  let fps: Double
  let averageBitRate: Int

  // Render-loop state; only touched on `renderQueue` (and read after it signals).
  private let renderQueue = DispatchQueue(label: "seam.video-export.render", qos: .userInitiated)
  private var nextFrame = 0
  private var renderError: Error?
  private var renderFinished = false
  private var aborted = false

  init(width: Int, height: Int, fps: Double, averageBitRate: Int = 12_000_000) {
    self.width = width
    self.height = height
    self.fps = fps
    self.averageBitRate = averageBitRate
  }

  /// Presentation time of frame `index`. Exact for integer and 3-decimal frame rates (e.g. 29.97).
  func frameTime(_ index: Int) -> CMTime {
    let timescale = Int32(max(1, (fps * 1000).rounded()))
    return CMTime(value: CMTimeValue(index) * 1000, timescale: timescale)
  }

  /// Renders `frameCount` frames into `url` (an .mp4 that must not exist yet).
  /// - Parameters:
  ///   - progress: fraction of frames encoded (0...1), called on the render queue.
  ///   - draw: draws frame `index` into the flipped (y-down, top-left origin) context.
  func encode(
    frameCount: Int,
    to url: URL,
    progress: @escaping (Double) -> Void,
    draw: @escaping (_ index: Int, _ context: CGContext) throws -> Void
  ) throws {
    let writer: AVAssetWriter
    do {
      writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    } catch {
      throw SeamExportError("Cannot create the video writer: \(error.localizedDescription)")
    }
    writer.shouldOptimizeForNetworkUse = true

    let keyFrameInterval = max(1, Int(fps.rounded()))
    let videoSettings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: width,
      AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: averageBitRate,
        AVVideoMaxKeyFrameIntervalKey: keyFrameInterval,
        AVVideoExpectedSourceFrameRateKey: fps,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoH264EntropyModeKey: AVVideoH264EntropyModeCABAC,
      ] as [String: Any],
      AVVideoColorPropertiesKey: [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
      ],
    ]
    // AVAssetWriterInput raises an ObjC exception for unsupported settings; check first.
    guard writer.canApply(outputSettings: videoSettings, forMediaType: .video) else {
      throw SeamExportError("H.264 encoding is not supported for \(width)x\(height) @ \(fps) fps on this device")
    }
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
    input.expectsMediaDataInRealTime = false
    guard writer.canAdd(input) else {
      throw SeamExportError("Cannot add the video input to the writer")
    }
    writer.add(input)

    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: input,
      sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
        kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
        kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
      ]
    )

    guard writer.startWriting() else {
      throw SeamExportError("Cannot start writing: \(writer.error?.localizedDescription ?? "unknown error")")
    }
    writer.startSession(atSourceTime: .zero)

    nextFrame = 0
    renderError = nil
    renderFinished = false
    aborted = false
    let done = DispatchSemaphore(value: 0)

    input.requestMediaDataWhenReady(on: renderQueue) { [self] in
      guard !renderFinished else { return }
      while input.isReadyForMoreMediaData && nextFrame < frameCount && renderError == nil && !aborted {
        let index = nextFrame
        do {
          try autoreleasepool {
            try renderFrame(index, adaptor: adaptor, writer: writer, draw: draw)
          }
          nextFrame += 1
          progress(Double(nextFrame) / Double(frameCount))
        } catch {
          renderError = error
        }
      }
      if nextFrame >= frameCount || renderError != nil || aborted {
        renderFinished = true
        input.markAsFinished()
        done.signal()
      }
    }

    // Wait for the render loop, watching for asynchronous writer failures (which could
    // otherwise leave us waiting for a readiness callback that never comes).
    while done.wait(timeout: .now() + .milliseconds(250)) == .timedOut {
      if writer.status == .failed || writer.status == .cancelled {
        let stillRunning: Bool = renderQueue.sync {
          if renderFinished { return false }
          aborted = true
          renderFinished = true
          return true
        }
        if stillRunning {
          break
        }
      }
    }

    let failure: Error? = renderQueue.sync { renderError }
    if writer.status == .failed || writer.status == .cancelled || failure != nil {
      let reason = failure.map { ($0 as? SeamExportError)?.message ?? $0.localizedDescription }
        ?? writer.error?.localizedDescription
        ?? "unknown writer error"
      if writer.status == .writing {
        writer.cancelWriting()
      }
      throw SeamExportError("Encoding failed: \(reason)")
    }

    writer.endSession(atSourceTime: frameTime(frameCount))
    let finished = DispatchSemaphore(value: 0)
    writer.finishWriting { finished.signal() }
    finished.wait()
    guard writer.status == .completed else {
      throw SeamExportError("Finishing the video failed: \(writer.error?.localizedDescription ?? "unknown error")")
    }
  }

  private func renderFrame(
    _ index: Int,
    adaptor: AVAssetWriterInputPixelBufferAdaptor,
    writer: AVAssetWriter,
    draw: (Int, CGContext) throws -> Void
  ) throws {
    guard let pool = adaptor.pixelBufferPool else {
      throw SeamExportError("Pixel buffer pool unavailable (\(writer.error?.localizedDescription ?? "writer not ready"))")
    }
    var maybeBuffer: CVPixelBuffer?
    let status = CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &maybeBuffer)
    guard status == kCVReturnSuccess, let buffer = maybeBuffer else {
      throw SeamExportError("Cannot allocate a pixel buffer (CVReturn \(status))")
    }

    try drawFrame(index, into: buffer, draw: draw)

    if !adaptor.append(buffer, withPresentationTime: frameTime(index)) {
      throw SeamExportError("Appending frame \(index) failed: \(writer.error?.localizedDescription ?? "unknown error")")
    }
  }

  private func drawFrame(_ index: Int, into buffer: CVPixelBuffer, draw: (Int, CGContext) throws -> Void) throws {
    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

    guard
      let base = CVPixelBufferGetBaseAddress(buffer),
      let ctx = CGContext(
        data: base,
        width: CVPixelBufferGetWidth(buffer),
        height: CVPixelBufferGetHeight(buffer),
        bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
        space: SeamGraphics.sRGB,
        bitmapInfo: SeamGraphics.bitmapInfo
      )
    else {
      throw SeamExportError("Cannot create a drawing context for the frame")
    }

    // CoreGraphics is y-up with the origin at the bottom-left; flip to the top-left/y-down
    // output-pixel space every caller works in.
    ctx.translateBy(x: 0, y: CGFloat(CVPixelBufferGetHeight(buffer)))
    ctx.scaleBy(x: 1, y: -1)
    ctx.interpolationQuality = .high
    ctx.setShouldAntialias(true)

    try draw(index, ctx)
    ctx.flush()
  }
}
