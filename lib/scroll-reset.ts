import { useFocusEffect } from 'expo-router';
import { useCallback, type RefObject } from 'react';
import type { FlatList, ScrollView } from 'react-native';

type Scrollable = ScrollView | FlatList<unknown>;

/**
 * Tatal ke atas setiap kali skrin difokus semula.
 *
 * Tab dan Stack mengekalkan skrin yang dilawati dalam memori, jadi tanpa ini
 * skrin dibuka semula di tengah-tengah senarai. HANYA kedudukan visual yang
 * diset semula — state skrin (carian, penapis, data) tidak disentuh.
 */
export function useResetScrollOnFocus<T extends Scrollable>(ref: RefObject<T | null>): void {
  useFocusEffect(
    useCallback(() => {
      const target = ref.current;
      if (!target) return;
      if ('scrollToOffset' in target) target.scrollToOffset({ offset: 0, animated: false });
      else target.scrollTo({ y: 0, animated: false });
    }, [ref]),
  );
}
