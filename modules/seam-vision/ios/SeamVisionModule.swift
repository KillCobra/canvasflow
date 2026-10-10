import ExpoModulesCore

public class SeamVisionModule: Module {
  /// Vision work runs one request at a time on this serial queue (never on the main/JS thread);
  /// subject lifting holds a full-resolution image and mask in memory.
  private let visionQueue = DispatchQueue(label: "seam.vision", qos: .userInitiated)

  public func definition() -> ModuleDefinition {
    Name("SeamVision")

    /// True on iOS 17+, where VNGenerateForegroundInstanceMaskRequest exists.
    Function("isSubjectLiftSupported") { () -> Bool in
      return SeamVision.isSubjectLiftSupported
    }

    AsyncFunction("detectFaces") { [weak self] (uri: String, promise: Promise) in
      guard let queue = self?.visionQueue else {
        promise.reject("ERR_SEAM_VISION", "Seam vision module was released")
        return
      }
      queue.async {
        do {
          let faces = try autoreleasepool { try SeamVision.detectFaces(uri: uri) }
          promise.resolve(faces.map { $0.dictionary })
        } catch {
          promise.reject("ERR_SEAM_VISION", "detectFaces failed: \(SeamVisionModule.message(for: error))")
        }
      }
    }

    AsyncFunction("classifyImage") { [weak self] (uri: String, limit: Int, promise: Promise) in
      guard let queue = self?.visionQueue else {
        promise.reject("ERR_SEAM_VISION", "Seam vision module was released")
        return
      }
      queue.async {
        do {
          let labels = try autoreleasepool { try SeamVision.classify(uri: uri, limit: limit) }
          promise.resolve(labels)
        } catch {
          promise.reject("ERR_SEAM_VISION", "classifyImage failed: \(SeamVisionModule.message(for: error))")
        }
      }
    }

    AsyncFunction("liftSubject") { [weak self] (uri: String, outputUri: String, maxEdge: Double, promise: Promise) in
      guard let queue = self?.visionQueue else {
        promise.reject("ERR_SEAM_VISION", "Seam vision module was released")
        return
      }
      guard maxEdge.isFinite, maxEdge >= 1 else {
        promise.reject("ERR_SEAM_VISION", "liftSubject failed: maxEdge must be a positive number (got \(maxEdge))")
        return
      }
      let edge = Int(min(maxEdge, 8192).rounded())
      queue.async {
        guard #available(iOS 17.0, *) else {
          promise.reject(
            "ERR_SEAM_VISION",
            "liftSubject requires iOS 17 or later (VNGenerateForegroundInstanceMaskRequest is unavailable on this device)"
          )
          return
        }
        do {
          let result = try autoreleasepool {
            try SeamVision.liftSubject(uri: uri, outputUri: outputUri, maxEdge: edge)
          }
          promise.resolve(result?.dictionary)
        } catch {
          promise.reject("ERR_SEAM_VISION", "liftSubject failed: \(SeamVisionModule.message(for: error))")
        }
      }
    }
  }

  private static func message(for error: Error) -> String {
    return (error as? SeamVisionError)?.message ?? error.localizedDescription
  }
}
