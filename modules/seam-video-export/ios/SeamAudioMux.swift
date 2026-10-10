import AVFoundation
import Foundation

/// Puts a soundtrack under a rendered (silent) video: audio from `start` in the source,
/// cut to the video's length, faded out over the last second. Returns false when the
/// source has no usable audio, in which case the caller keeps the silent video.
internal func seamMuxSoundtrack(
  audioURL: URL,
  start: Double,
  volume: Double,
  videoURL: URL,
  to outURL: URL
) throws -> Bool {
  let audioAsset = AVURLAsset(url: audioURL, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
  let audioTracks: [AVAssetTrack]
  do {
    audioTracks = try seamAwait { try await audioAsset.loadTracks(withMediaType: .audio) }
  } catch {
    throw SeamExportError("Cannot read audio from \(audioURL.lastPathComponent): \(error.localizedDescription)")
  }
  guard let audioTrack = audioTracks.first else { return false }

  let videoAsset = AVURLAsset(url: videoURL, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
  let videoTracks = try seamAwait { try await videoAsset.loadTracks(withMediaType: .video) }
  guard let videoTrack = videoTracks.first else {
    throw SeamExportError("Rendered video has no video track")
  }
  let videoRange = try seamAwait { try await videoTrack.load(.timeRange) }
  let duration = videoRange.duration.seconds

  let audioRange = try seamAwait { try await audioTrack.load(.timeRange) }
  let sourceStart = max(start, audioRange.start.seconds)
  let sourceEnd = min(sourceStart + duration, audioRange.end.seconds)
  guard sourceEnd - sourceStart > 0.05 else { return false }

  let composition = AVMutableComposition()
  guard
    let compVideo = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
    let compAudio = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
  else {
    throw SeamExportError("Cannot create composition tracks")
  }
  do {
    try compVideo.insertTimeRange(videoRange, of: videoTrack, at: .zero)
    try compAudio.insertTimeRange(CMTimeRange(start: seamTime(sourceStart), end: seamTime(sourceEnd)), of: audioTrack, at: .zero)
  } catch {
    throw SeamExportError("Cannot build the audio composition: \(error.localizedDescription)")
  }

  // Full volume, easing out over the last second so the song doesn't stop dead.
  let params = AVMutableAudioMixInputParameters(track: compAudio)
  let level = Float(min(max(volume, 0), 1))
  let used = sourceEnd - sourceStart
  let fade = min(1.0, used / 3)
  params.setVolume(level, at: .zero)
  params.setVolumeRamp(
    fromStartVolume: level,
    toEndVolume: 0,
    timeRange: CMTimeRange(start: seamTime(used - fade), duration: seamTime(fade))
  )
  let mix = AVMutableAudioMix()
  mix.inputParameters = [params]

  try? FileManager.default.removeItem(at: outURL)
  guard let session = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
    throw SeamExportError("Export preset unavailable")
  }
  session.audioMix = mix
  session.shouldOptimizeForNetworkUse = true
  if #available(iOS 18.0, *) {
    let box = SeamBox(session)
    try seamAwait { try await box.value.export(to: outURL, as: .mp4) }
  } else {
    session.outputURL = outURL
    session.outputFileType = .mp4
    let done = DispatchSemaphore(value: 0)
    session.exportAsynchronously { done.signal() }
    done.wait()
    guard session.status == .completed else {
      throw SeamExportError(session.error?.localizedDescription ?? "export status \(session.status.rawValue)")
    }
  }
  return true
}

/// Moves `from` to `to`, replacing whatever is there.
internal func seamReplaceItem(at to: URL, with from: URL) throws {
  let fm = FileManager.default
  try fm.createDirectory(at: to.deletingLastPathComponent(), withIntermediateDirectories: true)
  if fm.fileExists(atPath: to.path) {
    try fm.removeItem(at: to)
  }
  do {
    try fm.moveItem(at: from, to: to)
  } catch {
    try fm.copyItem(at: from, to: to)
  }
}
