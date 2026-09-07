import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { OptionalDateField } from '@/components/ui/optional-date-field';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import {
  deleteAnnouncement,
  fetchAnnouncements,
  updateAnnouncement,
  uploadAnnouncementPoster,
} from '@/lib/announcements';
import { useProgramAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { pickImage } from '@/lib/image-upload';
import { useGoBack } from '@/lib/navigation';
import { dateLabel, dateRangeLabel, type Announcement } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

const THUMB = 56;

/**
 * Urus pengumuman — modul JABATAN SETIAUSAHA.
 *
 * Suntingan berlaku DALAM senarai dan bukan pada skrin berasingan: pengumuman
 * mempunyai tiga medan sahaja, dan satu skrin butiran untuk tiga medan bermakna
 * dua ketukan tambahan untuk membetulkan satu tajuk.
 *
 * Pengurus melihat pengumuman yang tidak aktif juga — itu yang membezakan
 * senarai ini daripada carousel di skrin Utama, dan ia datang daripada policy
 * `announcements_select`, bukan daripada penapis di sini.
 */
export default function AnnouncementsScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { loading: accessLoading, canView, canEdit } = useProgramAccess();

  const [rows, setRows] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  /** Id baris yang sedang ditulis — baris lain kekal boleh disentuh. */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Announcement | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchAnnouncements());
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan pengumuman.') });
    } finally {
      setLoading(false);
    }
  }, []);

  // Skrin cipta kembali ke sini melalui `replace`, jadi senarai perlu dibaca
  // semula pada fokus dan bukan sekali sahaja semasa dipasang.
  useFocusEffect(
    useCallback(() => {
      if (accessLoading || !canView) return;
      void load();
    }, [accessLoading, canView, load]),
  );

  const patch = useCallback(
    async (row: Announcement, changes: Parameters<typeof updateAnnouncement>[1], message: string) => {
      if (busyId) return;

      setBanner(null);
      setBusyId(row.id);
      try {
        const saved = await updateAnnouncement(row.id, changes);
        setRows((current) => current.map((item) => (item.id === saved.id ? saved : item)));
        setBanner({ tone: 'positive', message });
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menyimpan perubahan.') });
      } finally {
        setBusyId(null);
      }
    },
    [busyId],
  );

  const changePoster = useCallback(
    async (row: Announcement) => {
      if (busyId) return;

      setBanner(null);
      try {
        const uri = await pickImage();
        if (!uri) return;

        setBusyId(row.id);
        const posterUrl = await uploadAnnouncementPoster(uri);
        const saved = await updateAnnouncement(row.id, { poster_url: posterUrl });
        setRows((current) => current.map((item) => (item.id === saved.id ? saved : item)));
        setBanner({ tone: 'positive', message: 'Poster telah dikemas kini.' });
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuat naik poster.') });
      } finally {
        setBusyId(null);
      }
    },
    [busyId],
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;

    setBanner(null);
    setBusyId(pendingDelete.id);
    try {
      await deleteAnnouncement(pendingDelete.id);
      setRows((current) => current.filter((item) => item.id !== pendingDelete.id));
      setBanner({ tone: 'positive', message: 'Pengumuman telah dipadam.' });
      setPendingDelete(null);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memadam pengumuman.') });
    } finally {
      setBusyId(null);
    }
  }, [pendingDelete]);

  const startEdit = useCallback((row: Announcement) => {
    setEditing(row);
    setDraftTitle(row.title);
    setDraftDescription(row.description ?? '');
    setDraftStart(row.start_date ?? '');
    setDraftEnd(row.end_date ?? '');
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editing || !draftTitle.trim()) return;
    await patch(
      editing,
      {
        title: draftTitle.trim(),
        description: draftDescription.trim() || null,
        start_date: draftStart || null,
        end_date: draftEnd || null,
      },
      'Pengumuman telah dikemas kini.',
    );
    setEditing(null);
  }, [draftDescription, draftEnd, draftStart, draftTitle, editing, patch]);

  if (accessLoading || loading) return <LoadingScreen />;

  if (!canView) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Pengumuman" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Modul Pengumuman memerlukan kebenaran melihat pada department JABATAN SETIAUSAHA."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Admin"
        title="Pengumuman"
        subtitle="Dipapar di skrin Utama setiap ahli"
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

        {canEdit ? (
          <Button
            label="+ Cipta Pengumuman"
            onPress={() => router.push('/(app)/admin/announcement-create')}
          />
        ) : (
          <Notice tone="info" message="Anda hanya mempunyai akses Lihat. Senarai di bawah adalah paparan sahaja." />
        )}

        <View className="pb-8">
          <SectionTitle
            title={'Senarai Pengumuman (' + rows.length + ')'}
            caption="Ahli melihat pengumuman yang aktif DAN berada dalam tempoh paparannya."
          />

          {rows.length === 0 ? (
            <EmptyState
              icon="megaphone-outline"
              title="Belum ada pengumuman"
              description="Pengumuman yang dicipta akan muncul di sini dan di skrin Utama setiap ahli."
            />
          ) : (
            <View className="gap-2">
              {rows.map((row) => {
                const busy = busyId === row.id;
                return (
                  <View key={row.id} className="gap-3 rounded-field border border-line bg-surface p-4">
                    <View className="flex-row items-center gap-3">
                      <Image
                        source={{ uri: row.poster_url }}
                        style={{ width: THUMB, height: THUMB, borderRadius: 12 }}
                        contentFit="cover"
                        transition={150}
                        accessibilityLabel={'Poster ' + row.title}
                      />
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-ink" numberOfLines={2}>
                          {row.title}
                        </Text>
                        <Text className="mt-0.5 text-xs text-ink-muted">{windowLabel(row)}</Text>
                      </View>
                      <Badge label={row.is_active ? 'Aktif' : 'Tidak aktif'} tone={row.is_active ? 'positive' : 'neutral'} />
                    </View>

                    {canEdit ? (
                      <View className="flex-row flex-wrap gap-2">
                        <ActionChip
                          label={row.is_active ? 'Matikan' : 'Hidupkan'}
                          disabled={busy}
                          onPress={() =>
                            void patch(
                              row,
                              { is_active: !row.is_active },
                              row.is_active ? 'Pengumuman dimatikan.' : 'Pengumuman dihidupkan.',
                            )
                          }
                        />
                        <ActionChip label="Sunting" disabled={busy} onPress={() => startEdit(row)} />
                        <ActionChip label="Tukar Poster" disabled={busy} onPress={() => void changePoster(row)} />
                        <ActionChip label="Padam" destructive disabled={busy} onPress={() => setPendingDelete(row)} />
                      </View>
                    ) : null}

                    {editing?.id === row.id ? (
                      <View className="gap-3 border-t border-line pt-3">
                        <TextField
                          label="Tajuk"
                          value={draftTitle}
                          onChangeText={setDraftTitle}
                          editable={!busy}
                          autoCapitalize="sentences"
                        />
                        <TextField
                          label="Penerangan"
                          value={draftDescription}
                          onChangeText={setDraftDescription}
                          editable={!busy}
                          autoCapitalize="sentences"
                          multiline
                          numberOfLines={5}
                        />
                        <OptionalDateField
                          label="Tarikh mula"
                          value={draftStart}
                          onChange={setDraftStart}
                          disabled={busy}
                        />
                        <OptionalDateField
                          label="Tarikh tamat"
                          value={draftEnd}
                          onChange={setDraftEnd}
                          disabled={busy}
                        />
                        <Button
                          label="Simpan"
                          loading={busy}
                          disabled={busy || !draftTitle.trim()}
                          onPress={() => void saveEdit()}
                        />
                        <Button label="Batal" variant="ghost" disabled={busy} onPress={() => setEditing(null)} />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </View>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title="Padam pengumuman?"
        message={
          pendingDelete
            ? '"' + pendingDelete.title + '" akan dipadam dan hilang dari skrin Utama setiap ahli.'
            : ''
        }
        confirmLabel="Padam"
        destructive
        busy={busyId !== null}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </Screen>
  );
}

/**
 * Tempoh paparan dalam satu baris.
 *
 * Kedua-dua hujung boleh tiada, jadi empat kombinasi — dan setiap satu diberi
 * ayatnya sendiri. "— – 30/09/2026" boleh dibaca, tetapi hanya oleh seseorang
 * yang sudah tahu apa maksudnya.
 */
function windowLabel(row: Announcement): string {
  if (!row.start_date && !row.end_date) return 'Tiada had tempoh';
  if (row.start_date && row.end_date) {
    return dateRangeLabel(row.start_date, row.end_date);
  }
  if (row.start_date) return 'Dari ' + dateLabel(row.start_date);
  return 'Sehingga ' + dateLabel(row.end_date as string);
}

function ActionChip({
  label,
  destructive = false,
  disabled,
  onPress,
}: {
  label: string;
  destructive?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`rounded-pill px-4 py-2 ${destructive ? 'bg-negative-soft' : 'bg-primary-soft'} ${
        disabled ? 'opacity-50' : 'active:opacity-70'
      }`}>
      <Text className={`text-xs font-semibold ${destructive ? 'text-negative' : 'text-primary'}`}>{label}</Text>
    </Pressable>
  );
}
