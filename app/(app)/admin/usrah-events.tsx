import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { useUsrahAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { fetchUsrahEvents } from '@/lib/usrah-events';
import { downloadUsrahReport } from '@/lib/usrah-report';
import { USRAH_EVENT_STATUS_LABEL, dateLabel, timeLabel, usrahEventStatus, type UsrahEvent } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

const STATUS_TONE = {
  aktif: 'positive',
  tamat: 'neutral',
  nonaktif: 'warn',
} as const;

export default function UsrahEventsScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { loading: accessLoading, canView, canEdit } = useUsrahAccess();

  const [events, setEvents] = useState<UsrahEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEvents(await fetchUsrahEvents());
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

  const exportReport = useCallback(async () => {
    if (exporting) return;

    const parsed = Number.parseInt(year, 10);
    if (!Number.isFinite(parsed)) {
      setBanner({ tone: 'negative', message: 'Masukkan tahun yang sah.' });
      return;
    }

    setBanner(null);
    setExporting(true);
    try {
      const report = await downloadUsrahReport(parsed);
      setBanner({
        tone: 'positive',
        message: 'Laporan ' + report.fileName + ' dijana (' + report.rows + ' ahli).',
      });
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menjana laporan.') });
    } finally {
      setExporting(false);
    }
  }, [exporting, year]);

  if (accessLoading || loading) return <LoadingScreen />;

  if (!canView) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Program Usrah" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Program usrah memerlukan kebenaran melihat pada department LAJNAH TARBIAH."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Admin"
        title="Program Usrah"
        subtitle="Cipta program, jana kod QR dan muat turun laporan"
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

        {canEdit ? (
          <Button label="+ Cipta Program" onPress={() => router.push('/(app)/admin/usrah-event-create')} />
        ) : (
          <Notice tone="info" message="Anda hanya mempunyai akses Lihat. Program di bawah adalah paparan sahaja." />
        )}

        <View>
          <SectionTitle
            title={'Senarai Program (' + events.length + ')'}
            caption="Status dikira daripada tetingkap sah tiga jam selepas program bermula."
          />

          {events.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title="Belum ada program"
              description="Program yang dicipta akan muncul di sini bersama kod QR kehadirannya."
            />
          ) : (
            <View className="gap-2">
              {events.map((event) => {
                const status = usrahEventStatus(event);
                return (
                  <Pressable
                    key={event.id}
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({ pathname: '/(app)/admin/usrah-event-detail', params: { id: event.id } })
                    }
                    className="flex-row items-center gap-3 rounded-field border border-line bg-surface p-4 active:opacity-70">
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
                        {event.name}
                      </Text>
                      <Text className="mt-0.5 text-xs text-ink-muted">
                        {dateLabel(event.event_date)} · {timeLabel(event.event_time)}
                        {event.location_text ? ' · ' + event.location_text : ''}
                      </Text>
                    </View>
                    <Badge label={USRAH_EVENT_STATUS_LABEL[status]} tone={STATUS_TONE[status]} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/*
          Eksport ialah bacaan, jadi `can_view` sudah memadai — admin yang hanya
          menyemak tidak perlu kebenaran menulis untuk mengeluarkan laporan.
        */}
        <View>
          <SectionTitle
            title="Muat Turun Laporan"
            caption="Kehadiran usrah bulanan setahun sebagai fail Excel (.xlsx)."
          />
          <Card>
            <View className="gap-4">
              <TextField
                label="Tahun"
                value={year}
                onChangeText={(value) => setYear(value.replace(/[^\d]/g, '').slice(0, 4))}
                editable={!exporting}
                keyboardType="number-pad"
              />
              <Button
                label="Jana Fail Excel"
                variant="secondary"
                loading={exporting}
                disabled={exporting}
                onPress={() => void exportReport()}
              />
            </View>
          </Card>
        </View>
      </View>
    </Screen>
  );
}
