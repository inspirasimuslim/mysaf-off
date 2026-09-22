import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, View } from 'react-native';
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
  driveImageUrl,
  fetchEventPhotos,
  getPhotoAccessToken,
  uploadEventPhoto,
  type EventPhoto,
} from '@/lib/event-photos';
import { pickImage } from '@/lib/image-upload';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/permissions';
import { fetchUsrahEvent } from '@/lib/usrah-events';
import type { UsrahEvent } from '@/types/database';

type Banner = { tone: 'positive' | 'negative'; message: string } | null;

const GRID_GAP = 6;

/**
 * Album Gambar Event — Google Drive Shared Drive, crowd-sourced.
 *
 * Gambar SEBENAR tidak pernah melalui pelayan Supabase: `getPhotoAccessToken()`
 * dipanggil SEKALI (dicache pada peringkat modul, ~1 jam), dan setiap `<Image>`
 * fetch terus dari Google guna token itu. Lihat `lib/event-photos.ts`.
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
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const [eventRow, photoRows, token] = await Promise.all([
        fetchUsrahEvent(eventId),
        fetchEventPhotos(eventId),
        getPhotoAccessToken(),
      ]);
      setEvent(eventRow);
      setPhotos(photoRows);
      setAccessToken(token);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memuatkan album.') });
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const canEdit =
    isSuperAdmin() || (event ? (event.event_type === 'usrah' ? usrahAccess.canEdit : programAccess.canEdit) : false);

  // --- Muat naik ---------------------------------------------------------------
  const [uploading, setUploading] = useState(false);

  const addPhoto = useCallback(async () => {
    if (!eventId || uploading) return;

    setBanner(null);
    try {
      const uri = await pickImage();
      if (!uri) return; // Dibatalkan.

      setUploading(true);
      await uploadEventPhoto(eventId, uri);
      setBanner({ tone: 'positive', message: 'Gambar berjaya dimuat naik.' });
      await load();
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memuat naik gambar.') });
    } finally {
      setUploading(false);
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

          <Button
            label={uploading ? 'Memuat naik…' : '+ Tambah Gambar'}
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
                        source={{ uri: driveImageUrl(photo.drive_file_id, accessToken) }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                        transition={150}
                      />
                    ) : null}
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
              source={{ uri: driveImageUrl(viewingPhoto.drive_file_id, accessToken) }}
              style={{ width: '100%', height: '80%' }}
              contentFit="contain"
              transition={150}
            />
          ) : (
            <ActivityIndicator color={Colors.white} />
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
