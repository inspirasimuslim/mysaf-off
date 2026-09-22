import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useProgramAccess, useUsrahAccess } from '@/lib/department-access';
import { toMalayErrorVerbose } from '@/lib/errors';
import {
  deleteEventPhoto,
  driveImageSource,
  fetchEventPhotos,
  getPhotoAccessToken,
  uploadEventPhoto,
  type EventPhoto,
} from '@/lib/event-photos';
import { pickImages } from '@/lib/image-upload';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/permissions';
import { fetchUsrahEvent } from '@/lib/usrah-events';
import type { UsrahEvent } from '@/types/database';

type Banner = { tone: 'positive' | 'negative'; message: string } | null;

const GRID_GAP = 6;
const LOG_TAG = '[EventAlbum]';

/**
 * Tamat masa untuk mana-mana panggilan pelayan skrin ini — TIADA had masa di
 * sini ialah punca bug "loading tak berkesudahan": bila Edge Function
 * tersekat, `await` tidak pernah selesai, `setLoading(false)` dalam
 * `finally` tidak pernah sampai, dan spinner berputar SELAMA-LAMANYA tanpa
 * sebarang mesej.
 */
const CALL_TIMEOUT_MS = 15_000;

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Tamat masa menunggu ' + label + '. Sila cuba lagi.')), CALL_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Album Gambar Event — Google Drive Shared Drive, crowd-sourced.
 *
 * Gambar SEBENAR tidak pernah melalui pelayan Supabase: `getPhotoAccessToken()`
 * dipanggil terus dari Google, dan setiap `<Image>` fetch terus dari Google
 * guna token itu. Lihat `lib/event-photos.ts`.
 *
 * `getPhotoAccessToken()` HANYA dipanggil bila senarai `event_photos` BUKAN
 * kosong — tiada sebab meminta token Google untuk album yang belum ada
 * sebarang gambar, dan setiap panggilan tambahan ialah satu lagi titik
 * kegagalan yang boleh menyekat skrin ini daripada dibuka langsung.
 */
export default function EventAlbumScreen() {
  const goBack = useGoBack();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const usrahAccess = useUsrahAccess();
  const programAccess = useProgramAccess();
  const { event_id: eventId } = useLocalSearchParams<{ event_id: string }>();

  const [event, setEvent] = useState<UsrahEvent | null>(null);
  const [photos, setPhotos] = useState<EventPhoto[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  const loadToken = useCallback(async () => {
    setTokenError(null);
    try {
      const token = await withTimeout(getPhotoAccessToken(), 'capaian gambar Google Drive');
      setAccessToken(token);
    } catch (caught) {
      console.error(LOG_TAG, 'gagal dapatkan access token:', caught);
      setTokenError(toMalayErrorVerbose(caught, 'Gagal memuatkan capaian gambar.'));
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setBanner(null);
    if (!eventId) {
      // Jangan biarkan spinner berputar selama-lamanya bila param tiada — lihat nota `withTimeout`.
      console.error(LOG_TAG, 'event_id tiada dalam route params — album tidak boleh dimuatkan');
      setLoading(false);
      setBanner({ tone: 'negative', message: 'Acara tidak dijumpai.' });
      return;
    }
    try {
      const [eventRow, photoRows] = await withTimeout(
        Promise.all([fetchUsrahEvent(eventId), fetchEventPhotos(eventId)]),
        'senarai album',
      );
      setEvent(eventRow);
      setPhotos(photoRows);

      // Lihat nota di atas komponen ini — token HANYA diminta bila perlu.
      if (photoRows.length > 0) {
        await loadToken();
      }
    } catch (caught) {
      console.error(LOG_TAG, 'gagal memuatkan album:', caught);
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memuatkan album.') });
    } finally {
      setLoading(false);
    }
  }, [eventId, loadToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const canEdit =
    isSuperAdmin() || (event ? (event.event_type === 'usrah' ? usrahAccess.canEdit : programAccess.canEdit) : false);

  // --- Muat naik ---------------------------------------------------------------
  /** Had munasabah untuk satu batch — elak payload keseluruhan terlalu besar. */
  const MAX_UPLOAD_SELECTION = 10;

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);

  const addPhoto = useCallback(async () => {
    if (!eventId || uploading) return;

    setBanner(null);
    try {
      const uris = await pickImages(MAX_UPLOAD_SELECTION);
      if (uris.length === 0) return; // Dibatalkan.

      setUploading(true);
      let success = 0;
      let failed = 0;
      // Berurutan (bukan Promise.all) — elak spike beban Edge Function bila
      // ramai gambar dipilih sekali gus.
      for (const [i, uri] of uris.entries()) {
        setUploadProgress({ done: i, total: uris.length });
        try {
          await uploadEventPhoto(eventId, uri);
          success++;
        } catch (caught) {
          failed++;
          console.error(LOG_TAG, 'gagal muat naik gambar ' + (i + 1) + '/' + uris.length + ':', caught);
        }
      }

      setBanner(
        failed === 0
          ? { tone: 'positive', message: success + ' gambar berjaya dimuat naik.' }
          : { tone: 'negative', message: success + ' berjaya, ' + failed + ' gagal dimuat naik.' },
      );
      await load();
    } catch (caught) {
      console.error(LOG_TAG, 'gagal memilih/muat naik gambar:', caught);
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memuat naik gambar.') });
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }, [eventId, load, uploading]);

  // --- Lightbox --------------------------------------------------------------
  const [viewingPhoto, setViewingPhoto] = useState<EventPhoto | null>(null);

  // --- Padam ---------------------------------------------------------------------
  const [pendingDelete, setPendingDelete] = useState<EventPhoto | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete || deleteBusy) return;

    setDeleteBusy(true);
    try {
      await deleteEventPhoto(pendingDelete.id);
      setPendingDelete(null);
      setViewingPhoto(null);
      setBanner({ tone: 'positive', message: 'Gambar berjaya dipadam.' });
      await load();
    } catch (caught) {
      console.error(LOG_TAG, 'gagal padam gambar:', caught);
      setPendingDelete(null);
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memadam gambar.') });
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteBusy, load, pendingDelete]);

  if (loading) return <LoadingScreen />;

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader
          eyebrow="Album Gambar"
          title={event?.name ?? 'Album'}
          subtitle={photos.length + ' gambar'}
          onBackPress={goBack}
        />

        <View className="gap-4 px-gutter pt-6 pb-8">
          {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

          {tokenError ? (
            <View className="gap-2">
              <Notice tone="negative" message={tokenError} />
              <Button label="Cuba Lagi Muatkan Gambar" variant="secondary" onPress={() => void loadToken()} />
            </View>
          ) : null}

          <Button
            label={
              uploadProgress
                ? 'Memuat naik ' + (uploadProgress.done + 1) + ' dari ' + uploadProgress.total + '…'
                : uploading
                  ? 'Memuat naik…'
                  : '+ Tambah Gambar'
            }
            loading={uploading}
            disabled={uploading}
            onPress={() => void addPhoto()}
          />

          {photos.length === 0 ? (
            <EmptyState
              icon="images-outline"
              title="Belum ada gambar"
              description="Jadi yang pertama kongsi gambar acara ini."
            />
          ) : (
            <View className="flex-row flex-wrap" style={{ gap: GRID_GAP }}>
              {photos.map((photo) => {
                const canDelete = canEdit || photo.uploaded_by === user?.id;
                return (
                  <Pressable
                    key={photo.id}
                    accessibilityRole="button"
                    accessibilityLabel="Lihat gambar penuh"
                    onPress={() => setViewingPhoto(photo)}
                    style={{ width: '32%', aspectRatio: 1 }}
                    className="overflow-hidden rounded-field bg-surface active:opacity-70">
                    {accessToken ? (
                      <Image
                        source={driveImageSource(photo.drive_file_id, accessToken)}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                        transition={150}
                      />
                    ) : (
                      <View className="h-full w-full items-center justify-center">
                        <Ionicons name="image-outline" size={20} color={Colors.inkFaint} />
                      </View>
                    )}
                    {canDelete ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Padam gambar"
                        hitSlop={8}
                        onPress={(pressEvent) => {
                          pressEvent.stopPropagation();
                          setPendingDelete(photo);
                        }}
                        className="absolute right-1.5 top-1.5 h-7 w-7 items-center justify-center rounded-pill bg-black/60 active:opacity-70">
                        <Ionicons name="trash-outline" size={14} color={Colors.white} />
                      </Pressable>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </Screen>

      {/* --- Lightbox ------------------------------------------------------------ */}
      <Modal visible={viewingPhoto !== null} animationType="fade" transparent onRequestClose={() => setViewingPhoto(null)}>
        <View className="flex-1 items-center justify-center bg-black/95" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tutup"
            hitSlop={10}
            onPress={() => setViewingPhoto(null)}
            className="absolute right-4 top-4 z-10 h-11 w-11 items-center justify-center rounded-pill bg-white/10 active:opacity-70"
            style={{ marginTop: insets.top }}>
            <Ionicons name="close" size={22} color={Colors.white} />
          </Pressable>

          {viewingPhoto && accessToken ? (
            <Image
              source={driveImageSource(viewingPhoto.drive_file_id, accessToken)}
              style={{ width: '100%', height: '80%' }}
              contentFit="contain"
              transition={150}
            />
          ) : (
            <View className="items-center gap-3 px-gutter">
              <Text className="text-center text-sm text-white/80">
                {tokenError ?? 'Gambar tidak dapat dipaparkan buat masa ini.'}
              </Text>
              <Button label="Cuba Lagi" variant="secondary" onPress={() => void loadToken()} />
            </View>
          )}

          {viewingPhoto && (canEdit || viewingPhoto.uploaded_by === user?.id) ? (
            <View className="px-gutter pt-4">
              <Button label="Padam Gambar Ini" variant="danger" onPress={() => setPendingDelete(viewingPhoto)} />
            </View>
          ) : null}
        </View>
      </Modal>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title="Padam gambar ini?"
        message="Gambar akan dipadam dari album dan dari Google Drive. Tindakan ini tidak boleh dibatalkan."
        confirmLabel="Padam"
        destructive
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
