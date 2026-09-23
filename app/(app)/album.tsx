import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Colors } from '@/constants/theme';
import { useProgramAccess, useUsrahAccess } from '@/lib/department-access';
import { deleteEventAlbum } from '@/lib/event-photos';
import { toMalayError, toMalayErrorVerbose } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/permissions';
import { fetchAllEventsDirectory } from '@/lib/usrah-events';
import { EVENT_TYPE_LABEL, dateRangeLabel, type EventDirectoryRow } from '@/types/database';

/**
 * Senarai SEMUA acara (lampau + semasa + akan datang) — laluan akses KEKAL
 * kepada album gambar acara, tanpa tapisan tarikh tamat. Lihat nota
 * `event_directory_all()` dan `event-info.tsx` (yang menyekat butang Album
 * pada acara tamat dan mengarah ke sini sebagai gantinya).
 */
export default function AlbumScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { isSuperAdmin } = usePermissions();
  const usrahAccess = useUsrahAccess();
  const programAccess = useProgramAccess();

  const [events, setEvents] = useState<EventDirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /*
    `useFocusEffect` (bukan `useEffect`) — sengaja. Skrin ini kekal dalam stack
    navigasi (bukan unmount) bila admin masuk ke `event-album` untuk "Padam
    Seluruh Album" lalu kembali (`goBack`), jadi `useEffect` sekali sahaja
    tidak akan pernah refetch dan senarai kekal STALE (acara yang baru disorok
    kelihatan masih ada walaupun DB sudah betul). Pattern sama seperti
    `usrah-sejarah.tsx` dan skrin lain yang refresh bila fokus semula.
  */
  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        setLoading(true);
        try {
          const rows = await fetchAllEventsDirectory(true);
          if (active) setEvents(rows);
        } catch (caught) {
          if (active) setError(toMalayError(caught, 'Gagal memuatkan senarai acara.'));
        } finally {
          if (active) setLoading(false);
        }
      })();

      return () => {
        active = false;
      };
    }, []),
  );

  // --- Padam album terus dari senarai (admin can_edit sahaja) ------------------
  const [pendingDelete, setPendingDelete] = useState<EventDirectoryRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canEditEvent = useCallback(
    (event: EventDirectoryRow) =>
      isSuperAdmin() || (event.event_type === 'usrah' ? usrahAccess.canEdit : programAccess.canEdit),
    [isSuperAdmin, usrahAccess.canEdit, programAccess.canEdit],
  );

  const confirmDeleteAlbum = useCallback(async () => {
    if (!pendingDelete || deleteBusy) return;

    setDeleteBusy(true);
    try {
      await deleteEventAlbum(pendingDelete.id);
      setEvents((rows) => rows.filter((row) => row.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (caught) {
      setDeleteError(toMalayErrorVerbose(caught, 'Gagal memadam album.'));
      setPendingDelete(null);
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteBusy, pendingDelete]);

  if (loading) return <LoadingScreen />;

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader title="Album" subtitle="Galeri gambar setiap acara" onBackPress={goBack} />
        <View className="gap-3 px-gutter pb-8 pt-2">
          {error ? <Notice tone="negative" message={error} /> : null}
          {deleteError ? <Notice tone="negative" message={deleteError} /> : null}

          {events.length === 0 && !error ? (
            <EmptyState icon="images-outline" title="Tiada acara" description="Belum ada acara direkodkan lagi." />
          ) : (
            events.map((event) => (
              <View
                key={event.id}
                className="flex-row items-center gap-3 rounded-field bg-surface p-3">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={'Buka album ' + event.name}
                  onPress={() => router.push({ pathname: '/(app)/event-album', params: { event_id: event.id } })}
                  className="flex-1 flex-row items-center gap-3 active:opacity-70">
                  {event.poster_url ? (
                    <Image
                      source={{ uri: event.poster_url }}
                      style={{ width: 48, height: 48, borderRadius: 8 }}
                      contentFit="cover"
                    />
                  ) : (
                    <View className="h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <Ionicons name="images-outline" size={20} color={Colors.primary} />
                    </View>
                  )}

                  <View className="flex-1">
                    <Text className="text-base font-semibold text-ink" numberOfLines={1}>
                      {event.name}
                    </Text>
                    <Text className="text-xs text-ink-muted">
                      {EVENT_TYPE_LABEL[event.event_type] + ' · ' + dateRangeLabel(event.start_date, event.end_date)}
                    </Text>
                  </View>

                  <Text className="text-xs text-ink-muted">{event.photo_count + ' gambar'}</Text>
                  <Ionicons name="chevron-forward" size={18} color={Colors.inkFaint} />
                </Pressable>

                {canEditEvent(event) && event.photo_count > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={'Padam album ' + event.name}
                    hitSlop={8}
                    onPress={() => {
                      setDeleteError(null);
                      setPendingDelete(event);
                    }}
                    className="h-8 w-8 items-center justify-center rounded-pill active:opacity-70">
                    <Ionicons name="trash-outline" size={16} color={Colors.negative} />
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
        </View>
      </Screen>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title="Padam album ini?"
        message={
          'Padam SEMUA ' +
          (pendingDelete?.photo_count ?? 0) +
          ' gambar acara "' +
          (pendingDelete?.name ?? '') +
          '" secara kekal (termasuk dari Google Drive)? Tindakan ini tidak boleh diundur.'
        }
        confirmLabel="Padam Album"
        destructive
        busy={deleteBusy}
        onConfirm={() => void confirmDeleteAlbum()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
