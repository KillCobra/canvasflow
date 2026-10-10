import ExpoModulesCore

// MARK: - Options (mirrors `ExportSlideOptions` / `PanVideoOptions` in index.ts)

internal struct RectRecord: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
  @Field var width: Double = 0
  @Field var height: Double = 0
}

/// One entry of `parts`. Image and video parts share a record; `type` discriminates.
internal struct SlidePartRecord: Record {
  @Field var type: String = "image"
  @Field var uri: String = ""
  // Video-only fields
  @Field var start: Double = 0
  @Field var length: Double = 0
  @Field var matrix: [Double] = [1, 0, 0, 1, 0, 0]
  @Field var frameWidth: Double = 0
  @Field var frameHeight: Double = 0
  @Field var cornerRadius: Double = 0
  @Field var drawRect: RectRecord = RectRecord()
  @Field var opacity: Double = 1
  @Field var colorMatrix: [Double]? = nil
  /// 'roundedRect' (default) | 'ellipse' | 'arch'
  @Field var clip: String? = nil
  /// Overrides the centered frame rect, in the same local coords.
  @Field var frameRect: RectRecord? = nil
}

internal struct AudioRecord: Record {
  @Field var uri: String = ""
  @Field var start: Double = 0
  @Field var volume: Double = 1
}

internal struct ExportSlideOptionsRecord: Record {
  @Field var width: Int = 1080
  @Field var height: Int = 1350
  @Field var fps: Double = 30
  @Field var duration: Double = 0
  @Field var parts: [SlidePartRecord] = []
  @Field var audio: AudioRecord? = nil
  @Field var outputUri: String = ""
}

internal struct PanDotsRecord: Record {
  /// Center line of the dots, output px.
  @Field var y: Double = 0
  @Field var color: String = "#FFFFFF66"
  @Field var activeColor: String = "#FFFFFF"
  /// Dot diameter, px.
  @Field var size: Double = 12
  /// Space between neighbouring dots, px.
  @Field var gap: Double = 10
}

internal struct PanVideoOptionsRecord: Record {
  @Field var slides: [String] = []
  @Field var width: Int = 1080
  @Field var height: Int = 1350
  @Field var window: RectRecord = RectRecord()
  @Field var background: String = "#000000"
  @Field var backgroundImage: String? = nil
  @Field var cornerRadius: Double = 0
  @Field var fps: Double = 30
  @Field var hold: Double = 1.6
  @Field var move: Double = 0.55
  @Field var dots: PanDotsRecord? = nil
  /// 'none' (default) or 'zoom': a slow push-in on each slide, easing back for the swipe.
  @Field var motion: String? = nil
  /// Optional soundtrack (e.g. a song from Files), from `start` seconds.
  @Field var audio: AudioRecord? = nil
  @Field var outputUri: String = ""
}

internal struct GridRevealOptionsRecord: Record {
  /// file:// URIs of each tile, in reading order (left to right, top to bottom).
  @Field var tiles: [String] = []
  @Field var columns: Int = 3
  @Field var rows: Int = 1
  @Field var width: Int = 1080
  @Field var height: Int = 1920
  @Field var background: String = "#0A0A0A"
  /// Space between tiles, px (Instagram's profile gap).
  @Field var gap: Double = 6
  /// Tile indices in the order they appear (posting order: last tile first).
  @Field var order: [Int] = []
  @Field var fps: Double = 30
  /// Seconds between one tile landing and the next.
  @Field var step: Double = 0.4
  /// Seconds the finished grid stays on screen.
  @Field var hold: Double = 2.5
  @Field var audio: AudioRecord? = nil
  @Field var outputUri: String = ""
}

// MARK: - Module

public class SeamVideoExportModule: Module {
  /// All exports run one after another on this serial queue (never on the main/JS thread).
  private let exportQueue = DispatchQueue(label: "seam.video-export", qos: .userInitiated)

  public func definition() -> ModuleDefinition {
    Name("SeamVideoExport")

    Events("onProgress")

    AsyncFunction("exportSlideVideo") { [weak self] (id: String, options: ExportSlideOptionsRecord, promise: Promise) in
      guard let self else {
        promise.reject("ERR_SEAM_VIDEO_EXPORT", "Seam video export module was released")
        return
      }
      self.runExport(id: id, label: "Seam video export", promise: promise) { report in
        try SlideVideoExporter(options: options, onProgress: report).run()
      }
    }

    AsyncFunction("exportPanVideo") { [weak self] (id: String, options: PanVideoOptionsRecord, promise: Promise) in
      guard let self else {
        promise.reject("ERR_SEAM_VIDEO_EXPORT", "Seam video export module was released")
        return
      }
      self.runExport(id: id, label: "Seam swipe video export", promise: promise) { report in
        try PanVideoExporter(options: options, onProgress: report).run()
      }
    }

    AsyncFunction("exportGridReveal") { [weak self] (id: String, options: GridRevealOptionsRecord, promise: Promise) in
      guard let self else {
        promise.reject("ERR_SEAM_VIDEO_EXPORT", "Seam video export module was released")
        return
      }
      self.runExport(id: id, label: "Seam grid reveal export", promise: promise) { report in
        try GridRevealExporter(options: options, onProgress: report).run()
      }
    }
  }

  /// Runs `work` on the export queue, forwarding throttled `onProgress` events tagged with `id`
  /// and settling `promise` with the output URI or an `ERR_SEAM_VIDEO_EXPORT` rejection.
  private func runExport(
    id: String,
    label: String,
    promise: Promise,
    work: @escaping (_ report: @escaping (Double) -> Void) throws -> String
  ) {
    exportQueue.async { [weak self] in
      var lastSent = -1
      let report: (Double) -> Void = { fraction in
        let clamped = min(max(fraction, 0), 1)
        let bucket = Int((clamped * 100).rounded(.down))
        // Throttle to whole-percent steps.
        if bucket != lastSent {
          lastSent = bucket
          self?.sendEvent("onProgress", ["id": id, "fraction": clamped])
        }
      }
      do {
        let outputUri = try work(report)
        report(1)
        promise.resolve(outputUri)
      } catch {
        let message = (error as? SeamExportError)?.message ?? error.localizedDescription
        promise.reject("ERR_SEAM_VIDEO_EXPORT", "\(label) failed: \(message)")
      }
    }
  }
}
