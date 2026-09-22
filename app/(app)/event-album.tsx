import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormModal } from '@/components/ui/form-modal';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useProgramAccess, useUsrahAccess } from '@/lib/department-access';
import { toMalayErrorVerbose } from '@/lib/errors';
import {
  deleteEventAlbum,
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

  // --- Lightbox (carousel swipeable/panah) ------------------------------------
  const { width: windowWidth } = useWindowDimensions();
  const lightboxRef = useRef<FlatList<EventPhoto>>(null);
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  /**
   * Tinggi SEBENAR (piksel, diukur via `onLayout`) — bukan `height: '100%'`.
   * FlatList mendatar pada react-native-web tidak sebarkan tinggi peratus ke
   * bekas kandungannya (item runtuh kepada tinggi 0 secara senyap, imej
   * "hilang" tanpa ralat) — hanya nombor piksel konkrit selamat di sini.
   */
  const [carouselHeight, setCarouselHeight] = useState(0);
  /** Berubah HANYA bila lightbox dibuka (bukan bila ditatal) — pemaksa FlatList
   *  mula semula pada kedudukan betul setiap kali dibuka, tanpa mengganggu
   *  gerakan tatal semasa pengguna sedang menatal. */
  const [lightboxOpenId, setLightboxOpenId] = useState(0);

  const openLightbox = useCallback((index: number) => {
    setViewingIndex(index);
    setLightboxOpenId((id) => id + 1);
  }, []);

  const goToIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= photos.length) return;
      lightboxRef.current?.scrollToIndex({ index, animated: true });
      setViewingIndex(index);
    },
    [photos.length],
  );

  const viewingPhoto = viewingIndex !== null ? (photos[viewingIndex] ?? null) : null;

  // Anak panah papan kekunci — web sahaja, aktif hanya semasa lightbox dibuka.
  useEffect(() => {
    if (Platform.OS !== 'web' || viewingIndex === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') goToIndex(viewingIndex - 1);
      else if (event.key === 'ArrowRight') goToIndex(viewingIndex + 1);
      else if (event.key === 'Escape') setViewingIndex(null);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewingIndex, goToIndex]);

  const lightboxItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: windowWidth, offset: windowWidth * index, index }),
    [windowWidth],
  );

  const onLightboxScrollEnd = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      setViewingIndex(Math.round(event.nativeEvent.contentOffset.x / windowWidth));
    },
    [windowWidth],
  );

  const renderLightboxItem = useCallback(
    ({ item }: { item: EventPhoto }) => (
      <View style={{ width: windowWidth, height: carouselHeight }} className="items-center justify-center">
        {accessToken ? (
          <Image
            source={driveImageSource(item.drive_file_id, accessToken)}
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
            /*
              TIADA `transition` di sini (sengaja) — item FlatList yang dimuat
              di luar skrin (cth kedudukan awal sebelum ditatal ke situ)
              tersekat pada opacity 0 di web ("cross-dissolve-end" tidak
              pernah sampai ke opacity 1) sebab animasi peralihan expo-image
              bergantung pada keterlihatan yang tidak pernah tercetus untuk
              item yang tidak pernah kelihatan semasa animasinya patut jalan.
            */
          />
        ) : (
          <View className="items-center gap-3 px-gutter">
            <Text className="text-center text-sm text-white/80">
              {tokenError ?? 'Gambar tidak dapat dipaparkan buat masa ini.'}
            </Text>
            <Button label="Cuba Lagi" variant="secondary" onPress={() => void loadToken()} />
          </View>
        )}
      </View>
    ),
    [accessToken, tokenError, loadToken, windowWidth, carouselHeight],
  );

  // --- Padam ---------------------------------------------------------------------
  const [pendingDelete, setPendingDelete] = useState<EventPhoto | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete || deleteBusy) return;

    setDeleteBusy(true);
    try {
      await deleteEventPhoto(pendingDelete.id);
      setPendingDelete(null);
      setViewingIndex(null);
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

  // --- Padam SELURUH album (admin can_edit sahaja) --------------------------------
  const [deletingAlbum, setDeletingAlbum] = useState(false);
  const [deleteAlbumConfirmText, setDeleteAlbumConfirmText] = useState('');
  const [deleteAlbumBusy, setDeleteAlbumBusy] = useState(false);

  const confirmDeleteAlbum = useCallback(async () => {
    if (!eventId || deleteAlbumBusy) return;

    setDeleteAlbumBusy(true);
    try {
      const result = await deleteEventAlbum(eventId);
      setDeletingAlbum(false);
      setBanner(
        result.failed === 0
          ? { tone: 'positive', message: result.deleted + ' gambar berjaya dipadam.' }
          : { tone: 'negative', message: result.deleted + ' dipadam, ' + result.failed + ' gagal — sila cuba lagi.' },
      );
      await load();
    } catch (caught) {
      console.error(LOG_TAG, 'gagal padam seluruh album:', caught);
      setDeletingAlbum(false);
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memadam album.') });
    } finally {
      setDeleteAlbumBusy(false);
    }
  }, [deleteAlbumBusy, eventId, load]);

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

          {canEdit && photos.length > 0 ? (
            <Button
              label="Padam Seluruh Album"
              variant="danger"
              onPress={() => {
                setDeleteAlbumConfirmText('');
                setDeletingAlbum(true);
              }}
            />
          ) : null}

          {photos.length === 0 ? (
            <EmptyState
              icon="images-outline"
              title="Belum ada gambar"
              description="Jadi yang pertama kongsi gambar acara ini."
            />
          ) : (
            <View className="flex-row flex-wrap" style={{ gap: GRID_GAP }}>
              {photos.map((photo, index) => {
                const canDelete = canEdit || photo.uploaded_by === user?.id;
                return (
                  <Pressable
                    key={photo.id}
                    accessibilityRole="button"
                    accessibilityLabel="Lihat gambar penuh"
                    onPress={() => openLightbox(index)}
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

      {/*
        --- Lightbox (carousel swipeable + panah web) -----------------------------
        `key={lightboxOpenId}` sengaja: `initialScrollIndex` FlatList hanya
        dihormati pada mount PERTAMA — tanpa key ini, buka semula pada gambar
        BERBEZA (selepas ditutup) akan kekal di kedudukan lama sebab FlatList
        tidak remount. Menatal sendiri (swipe/panah) tidak sentuh `lightboxOpenId`,
        jadi ia tidak mengganggu gerakan tatal semasa pengguna menatal.
      */}
      <Modal visible={viewingIndex !== null} animationType="fade" transparent onRequestClose={() => setViewingIndex(null)}>
        <View className="flex-1 bg-black/95" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tutup"
            hitSlop={10}
            onPress={() => setViewingIndex(null)}
            className="absolute right-4 top-4 z-10 h-11 w-11 items-center justify-center rounded-pill bg-white/10 active:opacity-70"
            style={{ marginTop: insets.top }}>
            <Ionicons name="close" size={22} color={Colors.white} />
          </Pressable>

          {viewingIndex !== null ? (
            <Text className="z-10 pt-3 text-center text-sm font-semibold text-white/80">
              {viewingIndex + 1} / {photos.length}
            </Text>
          ) : null}

          <View className="flex-1" onLayout={(event) => setCarouselHeight(event.nativeEvent.layout.height)}>
            {viewingIndex !== null && carouselHeight > 0 ? (
              <FlatList
                key={lightboxOpenId}
                ref={lightboxRef}
                data={photos}
                keyExtractor={(item) => item.id}
                renderItem={renderLightboxItem}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={viewingIndex}
                getItemLayout={lightboxItemLayout}
                onMomentumScrollEnd={onLightboxScrollEnd}
                style={{ height: carouselHeight }}
              />
            ) : null}

            {/* Panah kiri/kanan — web sahaja; native cukup dengan swipe. */}
            {Platform.OS === 'web' && viewingIndex !== null ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Gambar sebelum"
                  disabled={viewingIndex === 0}
                  onPress={() => goToIndex(viewingIndex - 1)}
                  className="absolute left-4 top-1/2 h-11 w-11 items-center justify-center rounded-pill bg-white/10 active:opacity-70"
                  style={{ marginTop: -22, opacity: viewingIndex === 0 ? 0.3 : 1 }}>
                  <Ionicons name="chevron-back" size={24} color={Colors.white} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Gambar seterusnya"
                  disabled={viewingIndex === photos.length - 1}
                  onPress={() => goToIndex(viewingIndex + 1)}
                  className="absolute right-4 top-1/2 h-11 w-11 items-center justify-center rounded-pill bg-white/10 active:opacity-70"
                  style={{ marginTop: -22, opacity: viewingIndex === photos.length - 1 ? 0.3 : 1 }}>
                  <Ionicons name="chevron-forward" size={24} color={Colors.white} />
                </Pressable>
              </>
            ) : null}
          </View>

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

      <FormModal
        visible={deletingAlbum}
        title="Padam seluruh album?"
        description={
          'Ini akan padam SEMUA ' + photos.length + ' gambar dalam album ini secara kekal, termasuk dari Google Drive. ' +
          'Tindakan ini tidak boleh diundur.'
        }
        dismissable={!deleteAlbumBusy}
        onClose={() => {
          setDeletingAlbum(false);
          setDeleteAlbumConfirmText('');
        }}>
        <Notice tone="warn" message="Taip PADAM di bawah untuk mengesahkan." />

        <TextField
          label="Taip PADAM"
          placeholder="PADAM"
          value={deleteAlbumConfirmText}
          onChangeText={setDeleteAlbumConfirmText}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!deleteAlbumBusy}
        />

        <Button
          label="Padam Seluruh Album"
          variant="danger"
          loading={deleteAlbumBusy}
          disabled={deleteAlbumBusy || deleteAlbumConfirmText.trim().toUpperCase() !== 'PADAM'}
          onPress={() => void confirmDeleteAlbum()}
        />
      </FormModal>
    </>
  );
}
