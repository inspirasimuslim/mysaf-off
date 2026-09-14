import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { EventDeleteModal, deleteResultMessage } from '@/components/event-delete-modal';
import { EventListRow, deleteMenuAction, exportMenuActions } from '@/components/event-list-row';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { ToggleRow } from '@/components/ui/toggle-row';
import { useProgramAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { downloadEventAttendance } from '@/lib/event-attendance-report';
import { deliveryMessage, type DeliveryMode } from '@/lib/file-delivery';
import { useGoBack } from '@/lib/navigation';
import { downloadRsvpList } from '@/lib/rsvp';
import { fetchUsrahEvents } from '@/lib/usrah-events';
import type { UsrahEvent } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

type ExportKind = 'kehadiran' | 'rsvp';

const EXPORTS = [
  { key: 'kehadiran', label: 'Kehadiran (.xlsx)', icon: 'download-outline' },
  { key: 'rsvp', label: 'Senarai RSVP (.xlsx)', icon: 'people-outline' },
] as const satisfies readonly { key: ExportKind; label: string; icon: string }[];

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

  const [showArchive, setShowArchive] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UsrahEvent | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEvents(await fetchUsrahEvents('program', showArchive));
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan senarai program.') });
    } finally {
      setLoading(false);
    }
  }, [showArchive]);

  useEffect(() => {
    if (accessLoading || !canView) return;
    void load();
  }, [accessLoading, canView, load]);

  /*
    Eksport ialah bacaan, jadi `can_view` sudah memadai — admin yang hanya
    menyemak tidak perlu kebenaran menulis untuk mengeluarkan senarai.
  */
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

        <ToggleRow
          icon="archive-outline"
          title="Papar Arkib"
          subtitle="Program yang dipadam tetapi ada rekod kehadiran/RSVP"
          value={showArchive}
          onValueChange={setShowArchive}
        />

        <View className="pb-8">
          <SectionTitle
            title={(showArchive ? 'Arkib Program (' : 'Senarai Program (') + events.length + ')'}
            caption={
              showArchive
                ? 'Sejarah kehadiran & RSVP kekal. Tekan ⋯ untuk eksport.'
                : 'Kehadiran program tidak masuk ke grid dua belas bulan usrah. Tekan ⋯ untuk eksport kehadiran.'
            }
          />

          {events.length === 0 ? (
            <EmptyState
              icon={showArchive ? 'archive-outline' : 'calendar-outline'}
              title={showArchive ? 'Tiada program diarkib' : 'Belum ada program'}
              description={
                showArchive
                  ? 'Program yang dipadam ketika ada rekod kehadiran/RSVP akan muncul di sini.'
                  : 'Program yang dicipta akan muncul di sini bersama kod QR kehadirannya.'
              }
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
                    ...exportMenuActions(EXPORTS, (kind, mode) => void runExport(event, kind, mode)),
                    ...(canEdit && !event.archived_at
                      ? [deleteMenuAction(() => { setBanner(null); setDeleteTarget(event); })]
                      : []),
                  ]}
                />
              ))}
            </View>
          )}
        </View>
      </View>

      <EventDeleteModal
        event={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDone={(event, result) => {
          setDeleteTarget(null);
          setBanner({ tone: result.outcome === 'deleted' ? 'positive' : 'info', message: deleteResultMessage(event, result) });
          void load();
        }}
        onError={(message) => {
          setDeleteTarget(null);
          setBanner({ tone: 'negative', message });
        }}
      />
    </Screen>
  );
}
