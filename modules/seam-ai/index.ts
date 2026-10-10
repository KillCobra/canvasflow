import { NativeModule, requireOptionalNativeModule } from 'expo';

export type AIAvailability = 'available' | 'unsupported' | 'deviceNotEligible' | 'notEnabled' | 'notReady' | 'unavailable';

export type PostCopy = { caption: string; hashtags: string[]; altText: string[] };

declare class SeamAINativeModule extends NativeModule {
  availability(): AIAvailability;
  generatePostCopy(context: string, slideCount: number): Promise<PostCopy>;
}

// Null in Expo Go / Android / web, where the native module isn't compiled in.
const NativeSeamAI = requireOptionalNativeModule<SeamAINativeModule>('SeamAI');

/** Whether Apple's on-device model can be used right now (and if not, why). */
export function aiAvailability(): AIAvailability {
  try {
    return NativeSeamAI?.availability() ?? 'unsupported';
  } catch {
    return 'unsupported';
  }
}

/** Caption, hashtags and per-slide alt text from Apple's on-device model. */
export async function generatePostCopy(context: string, slideCount: number): Promise<PostCopy> {
  if (!NativeSeamAI) throw new Error('On-device AI is not in this build.');
  const copy = await NativeSeamAI.generatePostCopy(context, slideCount);
  return {
    caption: String(copy?.caption ?? ''),
    hashtags: Array.isArray(copy?.hashtags) ? copy.hashtags.map(String) : [],
    altText: Array.isArray(copy?.altText) ? copy.altText.map(String) : [],
  };
}
