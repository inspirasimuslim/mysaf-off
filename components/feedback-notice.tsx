import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { fetchCounselMemberUnread } from '@/lib/counseling';
import { fetchFeedbackMemberUnread } from '@/lib/feedback-chat';
import { useColors } from '@/lib/theme';

/**
 * Banner Utama: ahli ada balasan baharu daripada admin dalam Maklum Balas
 * (migration 151). Hilang sebaik ahli membuka perbualan. Dalam-app sahaja;
 * kegagalan bacaan senyap.
 */
export function FeedbackNotice() {
  const router = useRouter();
  const colors = useColors();
  const [count, setCount] = useState(0);
  const [counselCount, setCounselCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchFeedbackMemberUnread()
        .then((value) => active && setCount(value))
        .catch(() => undefined);
      fetchCounselMemberUnread()
        .then((value) => active && setCounselCount(value))
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, []),
  );

  if (count === 0 && counselCount === 0) return null;

  return (
    <>
      {count > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Balasan baharu maklum balas"
          onPress={() => router.push('/(app)/maklum-balas')}
          className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-3 active:opacity-70">
          <Ionicons name="chatbubble-ellipses" size={24} color={colors.primary} />
          <View className="flex-1">
            <Text className="text-sm font-bold text-ink">
              {count === 1 ? 'Balasan baharu daripada admin' : count + ' balasan baharu daripada admin'}
            </Text>
            <Text className="text-xs text-ink-muted">Ketik untuk membuka Maklum Balas</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
        </Pressable>
      ) : null}
      {counselCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Balasan baharu kaunselor"
          onPress={() => router.push('/(app)/kaunseling')}
          className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-3 active:opacity-70">
          <Ionicons name="heart-circle" size={24} color={colors.primary} />
          <View className="flex-1">
            <Text className="text-sm font-bold text-ink">
              {counselCount === 1 ? 'Balasan baharu daripada kaunselor' : counselCount + ' balasan baharu daripada kaunselor'}
            </Text>
            <Text className="text-xs text-ink-muted">Ketik untuk membuka Bantuan Kaunseling</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
        </Pressable>
      ) : null}
    </>
  );
}
