import { File, Paths } from 'expo-file-system';

// Small app-wide preferences, kept in documents/settings.json.

type Settings = {
  onboarded?: boolean;
  /** What the user said they make (INTERESTS ids, see templates.ts). */
  interests?: string[];
};

const file = () => new File(Paths.document, 'settings.json');

function read(): Settings {
  try {
    return file().exists ? (JSON.parse(file().textSync()) as Settings) : {};
  } catch {
    return {};
  }
}

function write(patch: Settings) {
  file().write(JSON.stringify({ ...read(), ...patch }));
}

export const hasOnboarded = () => !!read().onboarded;
export const setOnboarded = () => write({ onboarded: true });

export function getInterests(): string[] {
  const v = read().interests;
  return Array.isArray(v) ? v.filter((i) => typeof i === 'string') : [];
}
export const setInterests = (interests: string[]) => write({ interests });

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
