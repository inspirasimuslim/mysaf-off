import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { Colors } from '@/constants/theme';
import { usePerkaderanAccess } from '@/lib/department-access';
import { toMalayErrorVerbose } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { fetchNaqibSessions } from '@/lib/perkaderan';
import type { NaqibSessionRow } from '@/types/database';

/** 'YYYY-MM-DD' → '12 Sep 2026'. */
function dateLabel(value: string): string {
  const parsed = new Date(value + 'T00:00:00');
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * PERINGKAT 2 navigasi admin: semua sesi SATU naqib, merentasi semua
 * kumpulan yang dipegangnya. Tap satu sesi -> PERINGKAT 3, reuse
 * `usrah-session-form.tsx` sedia ada (admin can_edit LAJNAH PERKADERAN
 * kekal boleh sunting di situ — tiada perubahan kebenaran, cuma navigasi).
 */
export default function NaqibSessionHistoryScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { memberId, naqibName } = useLocalSearchParams<{ memberId: string; naqibName?: string }>();
  const { loading: accessLoading, canView } = usePerkaderanAccess();

  const [sessions, setSessions] = useState<NaqibSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!memberId) return;
    setLoading(true);
    try {
      setSessions(await fetchNaqibSessions(memberId));
    } catch (caught) {
      setError(toMalayErrorVerbose(caught, 'Gagal memuatkan sejarah sesi.'));
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useFocusEffect(
    useCallback(() => {
      if (accessLoading || !canView) return;
      void load();
    }, [accessLoading, canView, load]),
  );

  if (accessLoading || loading) return <LoadingScreen />;

  if (!canView) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Sejarah Sesi" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Sejarah sesi naqib memerlukan kebenaran melihat pada department LAJNAH PERKADERAN."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Admin"
        title={naqibName ?? 'Sejarah Sesi'}
        subtitle={sessions.length + ' sesi merentasi semua kumpulan'}
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6 pb-8">
        {error ? <Notice tone="negative" message={error} /> : null}

        <View>
          <SectionTitle title="Senarai Sesi" caption="Tersusun terkini dahulu. Ketuk untuk lihat atau sunting." />

          {sessions.length === 0 ? (
            <EmptyState icon="calendar-outline" title="Belum ada sesi" description="Naqib ini belum mencipta sebarang sesi." />
          ) : (
            <View className="gap-2">
              {sessions.map((session) => (
                <Pressable
                  key={session.session_id}
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/admin/usrah-session-form',
                      params: { groupId: session.group_id, id: session.session_id },
                    })
                  }
                  className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-card active:opacity-70">
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-ink">{dateLabel(session.session_date)}</Text>
                    <Text className="mt-0.5 text-sm text-ink-muted" numberOfLines={1}>
                      {session.sekolah}
                      {session.location_text ? ' · ' + session.location_text : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.inkMuted} />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}
