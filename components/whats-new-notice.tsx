import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  changelogForVersion,
  currentAppVersion,
  getSeenVersion,
  markVersionSeen,
  type ChangelogEntry,
} from '@/lib/app-changelog';
import { useColors } from '@/lib/theme';

/**
 * Notifikasi Utama "Apa yang baharu" — muncul sekali bagi setiap versi app terpasang
 * yang mempunyai catatan dalam `CHANGELOG`. Ditutup (atau dibuka) menandanya sebagai dilihat.
 */
export function WhatsNewNotice() {
  const router = useRouter();
  const colors = useColors();
  const [entry, setEntry] = useState<ChangelogEntry | null>(null);

  useEffect(() => {
    let active = true;
    const version = currentAppVersion();
    const found = changelogForVersion(version);
    if (!found) return;
    getSeenVersion().then((seen) => {
      if (active && seen !== version) setEntry(found);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!entry) return null;

  const dismiss = () => {
    void markVersionSeen(entry.version);
    setEntry(null);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={'Apa yang baharu dalam versi ' + entry.version}
      onPress={() => {
        dismiss();
        router.push('/(app)/features');
      }}
      className="gap-2 rounded-card border border-line bg-surface p-3 active:opacity-70">
      <View className="flex-row items-center gap-3">
        <Ionicons name="sparkles" size={24} color={colors.primary} />
        <View className="flex-1">
          <Text className="text-sm font-bold text-ink">Apa yang baharu — versi {entry.version}</Text>
          <Text className="text-xs text-ink-muted">Ketik untuk lihat semua ciri MySAFF</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Tutup" hitSlop={10} onPress={dismiss}>
          <Ionicons name="close" size={20} color={colors.inkMuted} />
        </Pressable>
      </View>
      {entry.highlights.map((line) => (
        <Text key={line} className="text-xs leading-4 text-ink">
          • {line}
        </Text>
      ))}
    </Pressable>
  );
}
