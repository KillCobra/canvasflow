import AVFoundation
import CoreGraphics
import CoreImage
import Foundation
import ImageIO

internal struct SeamExportError: Error, LocalizedError {
  let message: String
  init(_ message: String) { self.message = message }
  var errorDescription: String? { message }
}

/// Mutable box used to hand results out of `@Sendable` closures.
internal final class SeamBox<T>: @unchecked Sendable {
  var value: T
  init(_ value: T) { self.value = value }
}

/// Runs an async AVFoundation loader synchronously. Only call this from a non-cooperative
/// dispatch queue (the export queue), never from the main thread or a Swift concurrency task.
internal func seamAwait<T>(_ operation: @escaping @Sendable () async throws -> T) throws -> T {
  let semaphore = DispatchSemaphore(value: 0)
  let box = SeamBox<Result<T, Error>?>(nil)
  Task.detached {
    do {
      box.value = .success(try await operation())
    } catch {
      box.value = .failure(error)
    }
    semaphore.signal()
  }
  semaphore.wait()
  guard let result = box.value else {
    throw SeamExportError("Internal error: async load produced no result")
  }
  return try result.get()
}

internal func seamFileURL(from uri: String, label: String) throws -> URL {
  let trimmed = uri.trimmingCharacters(in: .whitespacesAndNewlines)
  if trimmed.isEmpty {
    throw SeamExportError("\(label) URI is empty")
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
  throw SeamExportError("\(label) must be a file:// URI, got: \(trimmed)")
}

internal func seamRequireReadableFile(_ url: URL, label: String) throws {
  if !FileManager.default.isReadableFile(atPath: url.path) {
    throw SeamExportError("\(label) not found or not readable: \(url.path)")
  }
}

internal func seamTime(_ seconds: Double) -> CMTime {
  return CMTime(seconds: seconds, preferredTimescale: 600_000)
}

internal enum SeamGraphics {
  static let sRGB: CGColorSpace = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()

  /// BGRA, premultiplied alpha — matches the 32BGRA pixel buffers we encode.
  static let bitmapInfo: UInt32 =
    CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue

  /// Shared CIContext. Color management is disabled so color matrices act on the encoded
  /// (gamma) values, like Skia's ColorMatrix, and an identity matrix is an exact no-op.
  static let ciContext: CIContext = CIContext(options: [
    .workingColorSpace: NSNull(),
    .outputColorSpace: NSNull(),
    .cacheIntermediates: false,
  ])
}

/// Draws `image` into `rect` of a y-down (flipped) context without turning it upside down.
/// `CGContext.draw` assumes y-up, so undo the flip locally around the rect.
internal func seamDrawUpright(_ image: CGImage, in rect: CGRect, context ctx: CGContext) {
  ctx.saveGState()
  ctx.translateBy(x: rect.minX, y: rect.maxY)
  ctx.scaleBy(x: 1, y: -1)
  ctx.draw(image, in: CGRect(x: 0, y: 0, width: rect.width, height: rect.height))
  ctx.restoreGState()
}

/// Decodes the first image of a file fully into memory.
internal func seamLoadImage(_ url: URL, label: String) throws -> CGImage {
  guard
    let source = CGImageSourceCreateWithURL(url as CFURL, nil),
    let image = CGImageSourceCreateImageAtIndex(
      source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary
    )
  else {
    throw SeamExportError("Cannot decode \(label) (\(url.lastPathComponent))")
  }
  return image
}

/// Allocates a premultiplied BGRA sRGB bitmap context (the format we encode from).
internal func seamMakeBitmapContext(width: Int, height: Int, label: String) throws -> CGContext {
  guard width > 0, height > 0, let ctx = CGContext(
    data: nil,
    width: width,
    height: height,
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: SeamGraphics.sRGB,
    bitmapInfo: SeamGraphics.bitmapInfo
  ) else {
    throw SeamExportError("Cannot allocate a \(width)x\(height) bitmap for \(label)")
  }
  return ctx
}

/// An sRGB color parsed from '#RGB', '#RRGGBB' or '#RRGGBBAA'.
internal struct SeamColor: Equatable {
  var red: CGFloat
  var green: CGFloat
  var blue: CGFloat
  var alpha: CGFloat

  var cgColor: CGColor {
    return CGColor(colorSpace: SeamGraphics.sRGB, components: [red, green, blue, alpha])
      ?? CGColor(red: red, green: green, blue: blue, alpha: alpha)
  }

  /// Linear interpolation of the (gamma-encoded) components; t = 0 gives `self`.
  func mixed(with other: SeamColor, _ t: CGFloat) -> SeamColor {
    let k = min(max(t, 0), 1)
    return SeamColor(
      red: red + (other.red - red) * k,
      green: green + (other.green - green) * k,
      blue: blue + (other.blue - blue) * k,
      alpha: alpha + (other.alpha - alpha) * k
    )
  }

  static func parse(_ string: String, label: String) throws -> SeamColor {
    var hex = string.trimmingCharacters(in: .whitespacesAndNewlines)
    if hex.hasPrefix("#") { hex.removeFirst() }
    let valid = hex.allSatisfy { $0.isHexDigit }
    if valid && hex.count == 3 {
      hex = hex.map { "\($0)\($0)" }.joined()
    }
    guard valid, hex.count == 6 || hex.count == 8, let value = UInt64(hex, radix: 16) else {
      throw SeamExportError("\(label) must be a '#RRGGBB' color, got '\(string)'")
    }
    let rgba = hex.count == 8 ? value : (value << 8) | 0xFF
    return SeamColor(
      red: CGFloat((rgba >> 24) & 0xFF) / 255,
      green: CGFloat((rgba >> 16) & 0xFF) / 255,
      blue: CGFloat((rgba >> 8) & 0xFF) / 255,
      alpha: CGFloat(rgba & 0xFF) / 255
    )
  }
}

/// Clip shapes for video parts (`SlideVideoPart.clip` in index.ts).
internal enum SeamClipShape: String {
  case roundedRect
  case ellipse
  case arch

  static func parse(_ value: String?, label: String) throws -> SeamClipShape {
    guard let value, !value.isEmpty else { return .roundedRect }
    guard let shape = SeamClipShape(rawValue: value) else {
      throw SeamExportError("\(label) must be 'roundedRect', 'ellipse' or 'arch', got '\(value)'")
    }
    return shape
  }

  /// Path in the layer's local (y-down) coordinates.
  func path(in rect: CGRect, cornerRadius: CGFloat) -> CGPath {
    guard rect.width > 0, rect.height > 0 else {
      return CGPath(rect: rect, transform: nil)
    }
    switch self {
    case .roundedRect:
      // CGPath(roundedRect:) traps if the radius exceeds half the side.
      let radius = max(0, min(cornerRadius.isFinite ? cornerRadius : 0, rect.width / 2, rect.height / 2))
      return radius > 0
        ? CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)
        : CGPath(rect: rect, transform: nil)
    case .ellipse:
      return CGPath(ellipseIn: rect, transform: nil)
    case .arch:
      return SeamClipShape.archPath(in: rect)
    }
  }

  /// A rect whose top edge is replaced by a half-ellipse spanning the full width.
  /// The cap is `width / 2` tall (a semicircle), clamped to the rect's height.
  static func archPath(in rect: CGRect) -> CGPath {
    let rx = rect.width / 2
    let capHeight = min(rx, rect.height)
    let cy = rect.minY + capHeight // y-down: the cap spans minY...cy
    // Cubic Bezier approximation of a quarter ellipse.
    let k: CGFloat = 0.5522847498
    let path = CGMutablePath()
    path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
    path.addLine(to: CGPoint(x: rect.minX, y: cy))
    path.addCurve(
      to: CGPoint(x: rect.midX, y: rect.minY),
      control1: CGPoint(x: rect.minX, y: cy - k * capHeight),
      control2: CGPoint(x: rect.midX - k * rx, y: rect.minY)
    )
    path.addCurve(
      to: CGPoint(x: rect.maxX, y: cy),
      control1: CGPoint(x: rect.midX + k * rx, y: rect.minY),
      control2: CGPoint(x: rect.maxX, y: cy - k * capHeight)
    )
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
    path.closeSubpath()
    return path
  }
}
