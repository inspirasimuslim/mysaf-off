import { createContext, useContext } from 'react';

/**
 * Kata carian Hub Admin. Lalai '' = tiada tapisan, jadi `CollapsibleSection` yang
 * digunakan di tempat lain (borang ahli) tidak terkesan langsung.
 */
const HubSearchContext = createContext('');

export const HubSearchProvider = HubSearchContext.Provider;

export function useHubSearch(): string {
  return useContext(HubSearchContext);
}
