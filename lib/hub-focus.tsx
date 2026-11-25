import { createContext, useContext } from 'react';

/**
 * Fokus seksyen Hub Admin. Bila admin membuka satu lajnah, Hub menatal ke seksyen itu; bila admin
 * kembali (back) dari fungsi dalam lajnah itu, Hub menatal ke seksyen yang sama semula — bukan ke atas.
 * Lalai `null` supaya `CollapsibleSection` di luar Hub (borang ahli) tidak terkesan.
 */
export type HubFocusApi = {
  opened: (title: string, y: number) => void;
  closed: (title: string) => void;
  moved: (title: string, y: number) => void;
};

const HubFocusContext = createContext<HubFocusApi | null>(null);
export const HubFocusProvider = HubFocusContext.Provider;
export function useHubFocus(): HubFocusApi | null {
  return useContext(HubFocusContext);
}
