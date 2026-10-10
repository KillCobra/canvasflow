import { create } from 'zustand';

// Shell state shared between the dock and the tabs.

type UiState = {
  /** The "New carousel" sheet the dock's + opens (Home's empty state opens it too). */
  newProject: boolean;
  setNewProject: (open: boolean) => void;
  /** The folder open in Projects; new carousels made from there land in it. */
  folder: string | null;
  setFolder: (id: string | null) => void;
};

export const useUi = create<UiState>((set) => ({
  newProject: false,
  setNewProject: (newProject) => set({ newProject }),
  folder: null,
  setFolder: (folder) => set({ folder }),
}));
