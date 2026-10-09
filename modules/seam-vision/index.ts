import { NativeModule, requireOptionalNativeModule } from 'expo';

/** Normalized 0..1 rect, top-left origin, in the UPRIGHT image (EXIF orientation applied). */
export type NormRect = { x: number; y: number; width: number; height: number };

type LiftedSubject = { uri: string; width: number; height: number; rect: NormRect };

declare class SeamVisionNativeModule extends NativeModule {
  isSubjectLiftSupported(): boolean;
  detectFaces(uri: string): Promise<NormRect[]>;
  liftSubject(uri: string, outputUri: string, maxEdge: number): Promise<LiftedSubject | null>;
}

// Null in Expo Go / Android / web, where the native module isn't compiled in.
const NativeSeamVision = requireOptionalNativeModule<SeamVisionNativeModule>('SeamVision');

let subjectLiftSupported: boolean | undefined;

function requireNative(): SeamVisionNativeModule {
  if (!NativeSeamVision) {
    throw new Error(
      'Vision features are unavailable: the SeamVision native module is not in this build (Expo Go is not supported; use a development build on iOS).',
    );
  }
  return NativeSeamVision;
}

/** Native module present. */
export function isVisionAvailable(): boolean {
  return NativeSeamVision != null;
}

/** Native module present AND iOS >= 17 (VNGenerateForegroundInstanceMaskRequest). */
export function isSubjectLiftAvailable(): boolean {
  if (!NativeSeamVision) {
    return false;
  }
  if (subjectLiftSupported === undefined) {
    try {
      subjectLiftSupported = NativeSeamVision.isSubjectLiftSupported() === true;
    } catch {
      subjectLiftSupported = false;
    }
  }
  return subjectLiftSupported;
}

/** Face rectangles (VNDetectFaceRectanglesRequest), largest first. Resolves [] if none. */
export async function detectFaces(uri: string): Promise<NormRect[]> {
  return requireNative().detectFaces(uri);
}

/**
 * Lifts the main subject(s) out of the photo (all foreground instances combined),
 * writes a tightly cropped PNG with alpha (premultiplied edges handled, no halo) to outputUri,
 * and returns its pixel size plus where that crop sits in the source (normalized, upright).
 * Resolves null when no subject is found. Cap the output's longest edge at maxEdge (default 2048).
 */
export async function liftSubject(
  uri: string,
  outputUri: string,
  maxEdge?: number,
): Promise<{ uri: string; width: number; height: number; rect: NormRect } | null> {
  const result = await requireNative().liftSubject(uri, outputUri, maxEdge ?? 2048);
  return result ?? null;
}
