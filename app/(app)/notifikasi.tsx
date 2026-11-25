import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { fetchMyNotifications, markNotificationsRead, type MemberNotification } from '@/lib/notifications';
import { useGoBack } from '@/lib/navigation';
import { useColors } from '@/lib/theme';

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/** Peti masuk notifikasi ahli: program, peringatan, pengumuman dan notifikasi lain dalam 60 hari lepas. */
export default function NotifikasiScreen() {
  const goBack = useGoBack();
  const router = useRouter();
  const colors = useColors();
  const [rows, setRows] = useState<MemberNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchMyNotifications(60));
      setError(null);
    } catch {
      setError('Gagal memuat notifikasi. Sila cuba lagi.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const open = useCallback(
    (row: MemberNotification) => {
      if (!row.read_at) {
        setRows((current) => current?.map((r) => (r.id === row.id ? { ...r, read_at: new Date().toISOString() } : r)) ?? current);
        void markNotificationsRead(row.id).catch(() => undefined);
      }
      const url = row.route;
      if (url && url.startsWith('/(app)/')) {
        // `n` memaksa skrin tab tersembunyi memuat semula data.
        router.push((url + (url.includes('?') ? '&' : '?') + 'n=' + Date.now()) as never);
      }
    },
    [router],
  );

  const markAll = useCallback(async () => {
    try {
      await markNotificationsRead();
      await load();
    } catch {
      setError('Gagal menanda sebagai dibaca.');
    }
  }, [load]);

  const hasUnread = !!rows?.some((r) => !r.read_at);

  return (
    <Screen padTop={false}>
      <ScreenHeader title="Notifikasi" onBackPress={goBack} />

      <View className="gap-3 px-gutter pb-10 pt-5">
        {error ? <Notice tone="negative" message={error} /> : null}
        {hasUnread ? <Button label="Tandakan semua dibaca" variant="secondary" size="sm" onPress={() => void markAll()} /> : null}

        {rows && rows.length === 0 ? (
          <EmptyState
            icon="notifications-off-outline"
            title="Tiada notifikasi"
            description="Program baharu, peringatan dan pengumuman akan dipaparkan di sini."
          />
        ) : null}

        {rows?.map((row) => {
          const unread = !row.read_at;
          return (
            <Pressable key={row.id} accessibilityRole="button" accessibilityLabel={row.title + '. ' + row.body} onPress={() => open(row)}>
              <Card>
                <View className="flex-row items-start gap-3">
                  <View className="mt-1 h-3 w-3 rounded-pill" style={{ backgroundColor: unread ? colors.primary : 'transparent' }} />
                  <View className="flex-1">
                    <Text className={'text-base text-ink ' + (unread ? 'font-bold' : 'font-semibold')}>{row.title}</Text>
                    <Text className="mt-0.5 text-sm leading-5 text-ink">{row.body}</Text>
                    <Text className="mt-1 text-xs text-ink-muted">{timeLabel(row.created_at)}</Text>
                  </View>
                  {row.route ? <Ionicons name="chevron-forward" size={18} color={colors.inkMuted ?? colors.primary} /> : null}
                </View>
              </Card>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}
