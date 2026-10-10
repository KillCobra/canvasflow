import CoreGraphics
import CoreImage
import CoreImage.CIFilterBuiltins
import CoreML
import CoreVideo
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

// Expo-independent Vision logic (the module file only bridges it to JS), so it can also be
// compiled into the macOS test harness in ../test.

internal struct SeamVisionError: Error, LocalizedError {
  let message: String
  init(_ message: String) { self.message = message }
  var errorDescription: String? { message }
}

/// Normalized 0..1 rect, top-left origin, in the UPRIGHT image (EXIF orientation applied).
internal struct SeamNormRect: Equatable {
  var x: Double
  var y: Double
  var width: Double
  var height: Double

  init(x: Double, y: Double, width: Double, height: Double) {
    self.x = x
    self.y = y
    self.width = width
    self.height = height
  }

  /// Converts a Vision normalized rect (bottom-left origin, upright image) to top-left origin.
  init(visionRect: CGRect) {
    let clipped = visionRect.standardized.intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
    if clipped.isNull || clipped.isEmpty {
      self.init(x: 0, y: 0, width: 0, height: 0)
    } else {
      self.init(
        x: Double(clipped.minX),
        y: Double(1 - clipped.maxY),
        width: Double(clipped.width),
        height: Double(clipped.height)
      )
    }
  }

  var dictionary: [String: Double] {
    return ["x": x, "y": y, "width": width, "height": height]
  }
}

internal struct SeamLiftedSubject {
  /// file:// URI of the written PNG.
  let uri: String
  /// Pixel size of the PNG.
  let width: Int
  let height: Int
  /// Where the crop sits in the source image (normalized, upright, top-left origin).
  let rect: SeamNormRect

  var dictionary: [String: Any] {
    return ["uri": uri, "width": width, "height": height, "rect": rect.dictionary]
  }
}

internal enum SeamVision {
  static let defaultMaxEdge = 2048
  /// Longest edge of the image Vision analyzes for faces (normalized results don't depend on it).
  static let faceWorkingEdge = 4096
  /// Longest edge of the working image for subject lifting. Bounds memory (the decoded image plus a
  /// float mask of the same size) while keeping enough detail for crops of small subjects.
  static let liftWorkingEdge = 4096
  /// Mask values at or below this are treated as background when computing the crop.
  static let maskThreshold: Float = 4.0 / 255.0

  /// VNGenerateForegroundInstanceMaskRequest needs iOS 17 / macOS 14.
  static var isSubjectLiftSupported: Bool {
    if #available(iOS 17.0, macOS 14.0, *) {
      return true
    }
    return false
  }

  /// Color-managed context (linear working space) for compositing the lifted subject.
  private static let ciContext = CIContext(options: [.cacheIntermediates: false])
  private static let sRGB: CGColorSpace = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()

  // MARK: - Faces

  /// Face rectangles, largest first. Empty when there are none.
  static func detectFaces(uri: String) throws -> [SeamNormRect] {
    let url = try fileURL(from: uri, label: "uri")
    let image = try loadImage(url, maxPixelSize: faceWorkingEdge)

    let request = VNDetectFaceRectanglesRequest()
    preferCPUOnSimulator(request)
    // Vision applies the EXIF orientation, so results are relative to the upright image.
    let handler = VNImageRequestHandler(cgImage: image.cgImage, orientation: image.orientation, options: [:])
    do {
      try handler.perform([request])
    } catch {
      throw SeamVisionError("Face detection failed: \(error.localizedDescription)")
    }
    return (request.results ?? [])
      .map { SeamNormRect(visionRect: $0.boundingBox) }
      .filter { $0.width > 0 && $0.height > 0 }
      .sorted { $0.width * $0.height > $1.width * $1.height }
  }

  // MARK: - Labels

  /// What's in the photo (VNClassifyImageRequest), most confident first, for alt text.
  static func classify(uri: String, limit: Int) throws -> [String] {
    let url = try fileURL(from: uri, label: "uri")
    let image = try loadImage(url, maxPixelSize: 1024)
    let request = VNClassifyImageRequest()
    preferCPUOnSimulator(request)
    let handler = VNImageRequestHandler(cgImage: image.cgImage, orientation: image.orientation, options: [:])
    do {
      try handler.perform([request])
    } catch {
      throw SeamVisionError("Image classification failed: \(error.localizedDescription)")
    }
    return (request.results ?? [])
      .filter { $0.confidence >= 0.3 }
      .sorted { $0.confidence > $1.confidence }
      .prefix(max(1, limit))
      .map { $0.identifier.replacingOccurrences(of: "_", with: " ") }
  }

  // MARK: - Subject lift

  /// Lifts all foreground instances out of the photo into a tightly cropped PNG with alpha.
  /// Returns nil when Vision finds no subject.
  @available(iOS 17.0, macOS 14.0, *)
  static func liftSubject(uri: String, outputUri: String, maxEdge: Int) throws -> SeamLiftedSubject? {
    let url = try fileURL(from: uri, label: "uri")
    let outputURL = try fileURL(from: outputUri, label: "outputUri")
    let maxEdge = max(1, maxEdge)
    let image = try loadImage(url, maxPixelSize: max(liftWorkingEdge, min(maxEdge, 8192)))

    let request = VNGenerateForegroundInstanceMaskRequest()
    preferCPUOnSimulator(request)
    let handler = VNImageRequestHandler(cgImage: image.cgImage, orientation: image.orientation, options: [:])
    do {
      try handler.perform([request])
    } catch {
      throw SeamVisionError("Subject detection failed: \(error.localizedDescription)")
    }
    guard let observation = request.results?.first, !observation.allInstances.isEmpty else {
      return nil
    }

    // Soft mask of all instances combined, at the input image's resolution. Vision returns it in
    // the upright (EXIF-oriented) space, like its normalized coordinates.
    let maskBuffer: CVPixelBuffer
    do {
      maskBuffer = try observation.generateScaledMaskForImage(forInstances: observation.allInstances, from: handler)
    } catch {
      throw SeamVisionError("Cannot generate the subject mask: \(error.localizedDescription)")
    }

    var upright = CIImage(cgImage: image.cgImage).oriented(image.orientation)
    if upright.extent.origin != .zero {
      upright = upright.transformed(by: CGAffineTransform(
        translationX: -upright.extent.minX, y: -upright.extent.minY
      ))
    }
    let uprightWidth = Int(upright.extent.width.rounded())
    let uprightHeight = Int(upright.extent.height.rounded())
    guard uprightWidth > 0, uprightHeight > 0 else {
      throw SeamVisionError("Image \(url.lastPathComponent) has an invalid size")
    }

    // Mask values are used as-is (no color management): they're coverage, not color.
    var mask = CIImage(cvPixelBuffer: maskBuffer, options: [.colorSpace: NSNull()])
    var scanBuffer = maskBuffer
    let maskWidth = CVPixelBufferGetWidth(maskBuffer)
    let maskHeight = CVPixelBufferGetHeight(maskBuffer)
    if maskWidth != uprightWidth || maskHeight != uprightHeight {
      // Defensive: bring an unexpectedly sized/oriented mask into the upright image space.
      if maskWidth == image.cgImage.width && maskHeight == image.cgImage.height && image.orientation != .up {
        mask = mask.oriented(image.orientation)
        mask = mask.transformed(by: CGAffineTransform(translationX: -mask.extent.minX, y: -mask.extent.minY))
      }
      mask = mask.transformed(by: CGAffineTransform(
        scaleX: CGFloat(uprightWidth) / mask.extent.width,
        y: CGFloat(uprightHeight) / mask.extent.height
      ))
      scanBuffer = try render(mask, width: uprightWidth, height: uprightHeight)
    }

    guard let box = try maskBounds(scanBuffer, threshold: maskThreshold) else {
      return nil
    }

    // Premultiplied composite: color * mask over transparent. Edge pixels keep the photo's own
    // colors with partial alpha (no dark/light fringe once ImageIO un-premultiplies for PNG).
    let coverage = mask.applyingFilter("CIColorMatrix", parameters: [
      "inputRVector": CIVector(x: 1, y: 0, z: 0, w: 0),
      "inputGVector": CIVector(x: 1, y: 0, z: 0, w: 0),
      "inputBVector": CIVector(x: 1, y: 0, z: 0, w: 0),
      "inputAVector": CIVector(x: 1, y: 0, z: 0, w: 0),
      "inputBiasVector": CIVector(x: 0, y: 0, z: 0, w: 0),
    ])
    let blend = CIFilter.blendWithAlphaMask()
    blend.inputImage = upright
    blend.backgroundImage = CIImage.empty()
    blend.maskImage = coverage
    guard let lifted = blend.outputImage else {
      throw SeamVisionError("Cannot composite the subject")
    }

    // `box` is in top-left pixel space; CoreImage is bottom-left.
    let cropCI = CGRect(
      x: box.minX,
      y: CGFloat(uprightHeight) - box.maxY,
      width: box.width,
      height: box.height
    )
    var subject = lifted
      .cropped(to: cropCI)
      .transformed(by: CGAffineTransform(translationX: -cropCI.minX, y: -cropCI.minY))

    let cropWidth = Int(box.width)
    let cropHeight = Int(box.height)
    let scale = min(1, Double(maxEdge) / Double(max(cropWidth, cropHeight)))
    let outWidth = max(1, Int((Double(cropWidth) * scale).rounded()))
    let outHeight = max(1, Int((Double(cropHeight) * scale).rounded()))
    if outWidth != cropWidth || outHeight != cropHeight {
      // Area-averaging downsample: no Lanczos ringing (which would halo the alpha edge).
      subject = subject.transformed(
        by: CGAffineTransform(
          scaleX: CGFloat(outWidth) / CGFloat(cropWidth),
          y: CGFloat(outHeight) / CGFloat(cropHeight)
        ),
        highQualityDownsample: true
      )
    }

    let outRect = CGRect(x: 0, y: 0, width: outWidth, height: outHeight)
    guard let cgImage = ciContext.createCGImage(subject, from: outRect, format: .RGBA8, colorSpace: sRGB) else {
      throw SeamVisionError("Cannot render the lifted subject (\(outWidth)x\(outHeight))")
    }
    try writePNG(cgImage, to: outputURL)

    return SeamLiftedSubject(
      uri: outputURL.absoluteString,
      width: outWidth,
      height: outHeight,
      rect: SeamNormRect(
        x: Double(box.minX) / Double(uprightWidth),
        y: Double(box.minY) / Double(uprightHeight),
        width: Double(box.width) / Double(uprightWidth),
        height: Double(box.height) / Double(uprightHeight)
      )
    )
  }

  // MARK: - Image loading

  struct LoadedImage {
    /// Pixels as stored in the file (EXIF orientation NOT applied), possibly downsampled.
    let cgImage: CGImage
    /// How to rotate/flip `cgImage` to make it upright.
    let orientation: CGImagePropertyOrientation
  }

  /// Decodes a file:// image via ImageIO, keeping its stored orientation and reporting the EXIF
  /// orientation separately so Vision can apply it. Downsamples to `maxPixelSize` (longest edge).
  static func loadImage(_ url: URL, maxPixelSize: Int) throws -> LoadedImage {
    guard FileManager.default.isReadableFile(atPath: url.path) else {
      throw SeamVisionError("Image not found or not readable: \(url.path)")
    }
    guard
      let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
      CGImageSourceGetCount(source) > 0
    else {
      throw SeamVisionError("Cannot read \(url.lastPathComponent): not a supported image")
    }
    let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] ?? [:]
    let rawOrientation = (props[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1
    let orientation = CGImagePropertyOrientation(rawValue: rawOrientation) ?? .up
    let pixelWidth = (props[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue ?? 0
    let pixelHeight = (props[kCGImagePropertyPixelHeight] as? NSNumber)?.intValue ?? 0

    let decoded: CGImage?
    if pixelWidth <= 0 || pixelHeight <= 0 || max(pixelWidth, pixelHeight) > maxPixelSize {
      // Downsampled decode WITHOUT the transform, so `orientation` still describes the pixels.
      decoded = CGImageSourceCreateThumbnailAtIndex(source, 0, [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: false,
        kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
        kCGImageSourceShouldCacheImmediately: true,
      ] as CFDictionary)
    } else {
      decoded = CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary)
    }
    guard let cgImage = decoded, cgImage.width > 0, cgImage.height > 0 else {
      throw SeamVisionError("Cannot decode \(url.lastPathComponent)")
    }
    return LoadedImage(cgImage: cgImage, orientation: orientation)
  }

  static func fileURL(from uri: String, label: String) throws -> URL {
    let trimmed = uri.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty {
      throw SeamVisionError("\(label) is empty")
    }
    if trimmed.hasPrefix("/") {
      return URL(fileURLWithPath: trimmed)
    }
    if let url = URL(string: trimmed), url.isFileURL {
      return url
    }
    if trimmed.lowercased().hasPrefix("file://") {
      // Not a valid URL string (e.g. unescaped spaces); treat the remainder as a path.
      let path = String(trimmed.dropFirst("file://".count))
      return URL(fileURLWithPath: path.removingPercentEncoding ?? path)
    }
    throw SeamVisionError("\(label) must be a file:// URI, got: \(trimmed)")
  }

  // MARK: - Helpers

  /// Bounding box (top-left origin, pixels) of mask values above `threshold`, or nil if none.
  static func maskBounds(_ buffer: CVPixelBuffer, threshold: Float) throws -> CGRect? {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(buffer) else {
      throw SeamVisionError("Cannot read the subject mask")
    }
    let width = CVPixelBufferGetWidth(buffer)
    let height = CVPixelBufferGetHeight(buffer)
    let bytesPerRow = CVPixelBufferGetBytesPerRow(buffer)
    let format = CVPixelBufferGetPixelFormatType(buffer)

    var minX = width, minY = height, maxX = -1, maxY = -1
    // Rows are stored top to bottom.
    func scan<T>(_ type: T.Type, above: (T) -> Bool) {
      for y in 0..<height {
        let row = (base + y * bytesPerRow).assumingMemoryBound(to: T.self)
        var first = -1
        var last = -1
        for x in 0..<width where above(row[x]) {
          if first < 0 { first = x }
          last = x
        }
        if first >= 0 {
          minX = min(minX, first)
          maxX = max(maxX, last)
          if minY == height { minY = y }
          maxY = y
        }
      }
    }
    switch format {
    case kCVPixelFormatType_OneComponent32Float:
      scan(Float.self) { $0 > threshold }
    case kCVPixelFormatType_OneComponent8:
      let byteThreshold = UInt8(min(255, max(0, (threshold * 255).rounded(.down))))
      scan(UInt8.self) { $0 > byteThreshold }
    default:
      throw SeamVisionError("Unexpected subject mask format \(format)")
    }
    guard maxX >= minX, maxY >= minY else { return nil }
    return CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
  }

  /// Renders a single-channel CIImage into an 8-bit pixel buffer (top-left row order).
  private static func render(_ image: CIImage, width: Int, height: Int) throws -> CVPixelBuffer {
    var buffer: CVPixelBuffer?
    let status = CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_OneComponent8, [
      kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
    ] as CFDictionary, &buffer)
    guard status == kCVReturnSuccess, let buffer else {
      throw SeamVisionError("Cannot allocate a \(width)x\(height) mask buffer (CVReturn \(status))")
    }
    ciContext.render(image, to: buffer, bounds: CGRect(x: 0, y: 0, width: width, height: height), colorSpace: nil)
    return buffer
  }

  private static func writePNG(_ image: CGImage, to url: URL) throws {
    let fm = FileManager.default
    do {
      try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      if fm.fileExists(atPath: url.path) {
        try fm.removeItem(at: url)
      }
    } catch {
      throw SeamVisionError("Cannot write to \(url.path): \(error.localizedDescription)")
    }
    guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
      throw SeamVisionError("Cannot create a PNG at \(url.path)")
    }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else {
      throw SeamVisionError("Writing the PNG to \(url.path) failed")
    }
  }

  /// Vision's Neural Engine models often fail in the iOS Simulator ("Could not create inference
  /// context"); run them on the CPU there. No-op on devices.
  static func preferCPUOnSimulator(_ request: VNRequest) {
    #if targetEnvironment(simulator)
    if #available(iOS 17.0, *) {
      guard let stages = try? request.supportedComputeStageDevices else { return }
      for (stage, devices) in stages {
        let cpu = devices.first { device in
          if case .cpu = device { return true }
          return false
        }
        if let cpu {
          request.setComputeDevice(cpu, for: stage)
        }
      }
    } else {
      request.usesCPUOnly = true
    }
    #endif
  }
}
