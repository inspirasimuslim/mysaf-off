import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { EventListRow, exportMenuActions } from '@/components/event-list-row';
import { SaveShareButtons } from '@/components/save-share-buttons';
import { ScreenHeader } from '@/components/screen-header';
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
import { downloadEventAttendance } from '@/lib/event-attendance-report';
import { deliveryMessage, type DeliveryMode } from '@/lib/file-delivery';
import { useGoBack } from '@/lib/navigation';
import { downloadRsvpList } from '@/lib/rsvp';
import { fetchUsrahEvents } from '@/lib/usrah-events';
import { downloadUsrahReport } from '@/lib/usrah-report';
import type { UsrahEvent } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

type ExportKind = 'kehadiran' | 'rsvp';

const EXPORTS = [
  { key: 'kehadiran', label: 'Kehadiran (.xlsx)', icon: 'download-outline' },
  { key: 'rsvp', label: 'Senarai RSVP (.xlsx)', icon: 'people-outline' },
] as const satisfies readonly { key: ExportKind; label: string; icon: string }[];

export default function UsrahEventsScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { loading: accessLoading, canView, canEdit } = useUsrahAccess();

  const [events, setEvents] = useState<UsrahEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [exporting, setExporting] = useState<DeliveryMode | null>(null);

  /** Id sesi yang sedang dieksport — menu sesi lain dikunci sementara. */
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEvents(await fetchUsrahEvents('usrah'));
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

  const exportReport = useCallback(
    async (mode: DeliveryMode) => {
      if (exporting) return;

      const parsed = Number.parseInt(year, 10);
      if (!Number.isFinite(parsed)) {
        setBanner({ tone: 'negative', message: 'Masukkan tahun yang sah.' });
        return;
      }

      setBanner(null);
      setExporting(mode);
      try {
        const report = await downloadUsrahReport(parsed, mode);
        setBanner({
          tone: report.result === 'cancelled' ? 'info' : 'positive',
          message: deliveryMessage(report.result, report.fileName, report.rows + ' ahli'),
        });
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menjana laporan.') });
      } finally {
        setExporting(null);
      }
    },
    [exporting, year],
  );

  /* Kehadiran SATU sesi — tambahan kepada laporan tahunan di bawah, bukan pengganti. */
  const runExport = useCallback(
    async (event: UsrahEvent, kind: ExportKind, mode: DeliveryMode) => {
      if (busyId) return;

      setBanner(null);
      setBusyId(event.id);
      try {
        const report =
          kind === 'kehadiran'
            ? await downloadEventAttendance(event.id, event.name, mode)
            : await downloadRsvpList(event.id, event.name, mode);
        setBanner({
          tone: report.result === 'cancelled' ? 'info' : 'positive',
          message: deliveryMessage(report.result, report.fileName, report.rows + (kind === 'kehadiran' ? ' kehadiran' : ' respon')),
        });
      } catch (caught) {
        setBanner({
          tone: 'negative',
          message: toMalayError(caught, kind === 'kehadiran' ? 'Gagal menjana fail kehadiran.' : 'Gagal menjana senarai RSVP.'),
        });
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
        subtitle="Cipta sesi usrah, jana kod QR dan muat turun laporan tahunan"
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

        {canEdit ? (
          <Button
            label="+ Cipta Usrah"
            onPress={() => router.push({ pathname: '/(app)/admin/usrah-event-create', params: { type: 'usrah' } })}
          />
        ) : (
          <Notice tone="info" message="Anda hanya mempunyai akses Lihat. Program di bawah adalah paparan sahaja." />
        )}

        <View>
          <SectionTitle
            title={'Senarai Sesi (' + events.length + ')'}
            caption="Status dikira daripada tetingkap sah tiga jam selepas sesi tamat. Tekan ⋯ untuk eksport kehadiran sesi."
          />

          {events.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title="Belum ada sesi usrah"
              description="Sesi yang dicipta akan muncul di sini bersama kod QR kehadirannya."
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
                  actions={exportMenuActions(EXPORTS, (kind, mode) => void runExport(event, kind, mode))}
                />
              ))}
            </View>
          )}
        </View>

        {/*
          Eksport ialah bacaan, jadi `can_view` sudah memadai — admin yang hanya
          menyemak tidak perlu kebenaran menulis untuk mengeluarkan laporan.
        */}
        <View className="pb-8">
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
                editable={exporting === null}
                keyboardType="number-pad"
              />
              <SaveShareButtons
                kind="file"
                variant="secondary"
                webLabel="Jana Fail Excel"
                busy={exporting}
                onPress={(mode) => void exportReport(mode)}
              />
            </View>
          </Card>
        </View>
      </View>
    </Screen>
  );
}
