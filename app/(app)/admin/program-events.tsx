import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { EventListRow } from '@/components/event-list-row';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { useProgramAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { downloadEventAttendance } from '@/lib/event-attendance-report';
import { useGoBack } from '@/lib/navigation';
import { fetchUsrahEvents } from '@/lib/usrah-events';
import type { UsrahEvent } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

/**
 * Program am — modul JABATAN SETIAUSAHA.
 *
 * Bentuknya mengikut `usrah-events.tsx` kerana ia menguruskan table yang sama.
 * Eksport di sini ialah SATU FAIL SATU PROGRAM: program am tidak berkongsi
 * kalendar seperti usrah bulanan, dan soalan yang ditanya tentangnya sentiasa
 * "siapa hadir ke acara ini".
 */
export default function ProgramEventsScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { loading: accessLoading, canView, canEdit } = useProgramAccess();

  const [events, setEvents] = useState<UsrahEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  /** Id program yang sedang dieksport — menu program lain dikunci sementara. */
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEvents(await fetchUsrahEvents('program'));
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan senarai program.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accessLoading || !canView) return;
    void load();
  }, [accessLoading, canView, load]);

  /*
    Eksport ialah bacaan, jadi `can_view` sudah memadai — admin yang hanya
    menyemak tidak perlu kebenaran menulis untuk mengeluarkan senarai.
  */
  const exportAttendance = useCallback(
    async (event: UsrahEvent) => {
      if (busyId) return;

      setBanner(null);
      setBusyId(event.id);
      try {
        const report = await downloadEventAttendance(event.id, event.name);
        setBanner({ tone: 'positive', message: 'Fail ' + report.fileName + ' dijana (' + report.rows + ' kehadiran).' });
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menjana fail kehadiran.') });
      } finally {
        setBusyId(null);
      }
    },
    [busyId],
  );

  if (accessLoading || loading) return <LoadingScreen />;

  if (!canView) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Program" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Modul Program memerlukan kebenaran melihat pada department JABATAN SETIAUSAHA."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Admin"
        title="Program"
        subtitle="Cipta program, jana kod QR dan eksport kehadiran"
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

        {canEdit ? (
          <Button
            label="+ Cipta Program"
            onPress={() => router.push({ pathname: '/(app)/admin/usrah-event-create', params: { type: 'program' } })}
          />
        ) : (
          <Notice tone="info" message="Anda hanya mempunyai akses Lihat. Program di bawah adalah paparan sahaja." />
        )}

        <View className="pb-8">
          <SectionTitle
            title={'Senarai Program (' + events.length + ')'}
            caption="Kehadiran program tidak masuk ke grid dua belas bulan usrah. Tekan ⋯ untuk eksport kehadiran."
          />

          {events.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title="Belum ada program"
              description="Program yang dicipta akan muncul di sini bersama kod QR kehadirannya."
            />
          ) : (
            <View className="gap-2">
              {events.map((event) => (
                <EventListRow
                  key={event.id}
                  event={event}
                  onPress={() => router.push({ pathname: '/(app)/admin/usrah-event-detail', params: { id: event.id } })}
                  busy={busyId === event.id}
                  locked={busyId !== null}
                  actions={[
                    {
                      key: 'kehadiran',
                      label: 'Eksport Kehadiran (.xlsx)',
                      icon: 'download-outline',
                      onPress: () => void exportAttendance(event),
                    },
                  ]}
                />
              ))}
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}
