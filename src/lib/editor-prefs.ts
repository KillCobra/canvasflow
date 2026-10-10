import { File, Paths } from 'expo-file-system';
import { create } from 'zustand';

// Editor preferences that carry across projects, kept in documents/editor-prefs.json.

type Prefs = {
  /** Moving layers snaps to slide edges, centers and other layers. */
  snapping: boolean;
  /** Freehand strokes are smoothed when the finger lifts. */
  smoothInk: boolean;
};

const DEFAULTS: Prefs = { snapping: true, smoothInk: true };

const file = () => new File(Paths.document, 'editor-prefs.json');

function read(): Prefs {
  try {
    return file().exists ? { ...DEFAULTS, ...(JSON.parse(file().textSync()) as Partial<Prefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function write(prefs: Prefs) {
  try {
    file().write(JSON.stringify(prefs));
  } catch {
    // A preference that doesn't stick isn't worth interrupting anyone for.
  }
}

type PrefsState = Prefs & { setSnapping: (on: boolean) => void; setSmoothInk: (on: boolean) => void };

const prefsOf = (s: Prefs): Prefs => ({ snapping: s.snapping, smoothInk: s.smoothInk });

export const useEditorPrefs = create<PrefsState>((set, get) => ({
  ...read(),
  setSnapping: (snapping) => {
    set({ snapping });
    write(prefsOf(get()));
  },
  setSmoothInk: (smoothInk) => {
    set({ smoothInk });
    write(prefsOf(get()));
  },
}));
