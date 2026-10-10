import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import type { AspectId } from './types';

// Small app-wide preferences, kept in documents/settings.json.

export type ExportFormat = 'jpeg' | 'png';

export type Settings = {
  onboarded?: boolean;
  /** What the user said they make (INTERESTS ids, see templates.ts). */
  interests?: string[];
  /** Shown on the profile; there are no accounts, so it never leaves the phone. */
  name?: string;
  /** First launch, for "Creating since". */
  since?: number;
  /** Files saved to Photos, across all exports. */
  exports?: number;
  /** The newest What's New entry the user has opened. */
  seenNews?: string;
  exportFormat?: ExportFormat;
  defaultAspect?: AspectId;
  defaultSlides?: number;
};

const file = () => new File(Paths.document, 'settings.json');
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    return file().exists ? (JSON.parse(file().textSync()) as Settings) : {};
  } catch {
    return {};
  }
}

let cached: Settings | null = null;

function read(): Settings {
  if (cached === null) {
    cached = load();
    // Stamp the first launch so the profile can say how long you've been making.
    if (!cached.since) write({ since: Date.now() });
  }
  return cached;
}

function write(patch: Settings) {
  cached = { ...(cached ?? load()), ...patch };
  try {
    file().write(JSON.stringify(cached));
  } catch {
    // Kept in memory for this session.
  }
  listeners.forEach((l) => l());
}

export const updateSettings = (patch: Settings) => write(patch);

export function useSettings(): Settings {
  return useSyncExternalStore((l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  }, read);
}

export const hasOnboarded = () => !!read().onboarded;
export const setOnboarded = () => write({ onboarded: true });

export function getInterests(): string[] {
  const v = read().interests;
  return Array.isArray(v) ? v.filter((i) => typeof i === 'string') : [];
}
export const setInterests = (interests: string[]) => write({ interests });

export const exportFormat = (): ExportFormat => (read().exportFormat === 'png' ? 'png' : 'jpeg');
export const defaultAspect = (): AspectId => read().defaultAspect ?? '4:5';
export const defaultSlides = () => Math.max(1, Math.min(10, read().defaultSlides ?? 3));

/** Counts files saved to Photos, for the profile. */
export const recordExport = (files: number) => write({ exports: (read().exports ?? 0) + files });

// Set by onboarding; Home opens the sample once it's back in focus (pushing
// while the onboarding modal is still dismissing lands in the wrong stack).
let pendingSample = false;
export const requestSample = () => {
  pendingSample = true;
};
export const takeSampleRequest = () => {
  const v = pendingSample;
  pendingSample = false;
  return v;
};
