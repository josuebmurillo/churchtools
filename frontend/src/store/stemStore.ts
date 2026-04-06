import { create } from 'zustand';

export type StemState = {
  stems: Array<{
    id: string;
    url: string;
    volume: number;
    muted: boolean;
    solo: boolean;
    loaded: boolean;
    format: string;
  }>;
  setStems: (stems: StemState['stems']) => void;
  updateStem: (id: string, data: Partial<StemState['stems'][0]>) => void;
};

export const useStemStore = create<StemState>((set) => ({
  stems: [],
  setStems: (stems: StemState['stems']) => set({ stems }),
  updateStem: (id: string, data: Partial<StemState['stems'][0]>) => set((state: StemState) => ({
    stems: state.stems.map((stem) =>
      stem.id === id ? { ...stem, ...data } : stem
    ),
  })),
}));
