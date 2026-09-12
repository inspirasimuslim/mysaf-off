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
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import {
  deleteAdhocPayment,
  fetchAdhocPayments,
  updateAdhocPayment,
  uploadPaymentQr,
} from '@/lib/adhoc-payments';
import { useYuranAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { pickImage } from '@/lib/image-upload';
import { useGoBack } from '@/lib/navigation';
import type { AdhocPaymentType } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

const THUMB = 56;

/**
 * Urus pembayaran adhoc — modul BENDAHARI.
 *
 * Suntingan berlaku DALAM senarai dan bukan pada skrin berasingan, mengikut
 * pola `announcements.tsx`: rekod ini mempunyai tiga medan sahaja, dan satu
 * skrin butiran untuk tiga medan bermakna dua ketukan tambahan untuk
 * membetulkan satu tajuk.
 *
 * Bendahari melihat rekod yang tidak aktif juga — itu datang daripada policy
 * `adhoc_payment_types_select`, bukan daripada penapis di sini.
 */
export default function AdhocPaymentListScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { loading: accessLoading, canView, canEdit } = useYuranAccess();

  const [rows, setRows] = useState<AdhocPaymentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  /** Id baris yang sedang ditulis — baris lain kekal boleh disentuh. */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdhocPaymentType | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [pendingDelete, setPendingDelete] = useState<AdhocPaymentType | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchAdhocPayments());
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan senarai pembayaran.') });
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
    async (row: AdhocPaymentType, changes: Parameters<typeof updateAdhocPayment>[1], message: string) => {
      if (busyId) return;

      setBanner(null);
      setBusyId(row.id);
      try {
        const saved = await updateAdhocPayment(row.id, changes);
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

  const changeQr = useCallback(
    async (row: AdhocPaymentType) => {
      if (busyId) return;

      setBanner(null);
      try {
        const uri = await pickImage();
        if (!uri) return;

        setBusyId(row.id);
        const qrUrl = await uploadPaymentQr(uri);
        const saved = await updateAdhocPayment(row.id, { qr_image_url: qrUrl });
        setRows((current) => current.map((item) => (item.id === saved.id ? saved : item)));
        setBanner({ tone: 'positive', message: 'Kod QR telah dikemas kini.' });
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuat naik kod QR.') });
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
      await deleteAdhocPayment(pendingDelete.id);
      setRows((current) => current.filter((item) => item.id !== pendingDelete.id));
      setBanner({ tone: 'positive', message: 'Pembayaran telah dipadam.' });
      setPendingDelete(null);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memadam pembayaran.') });
    } finally {
      setBusyId(null);
    }
  }, [pendingDelete]);

  const startEdit = useCallback((row: AdhocPaymentType) => {
    setEditing(row);
    setDraftTitle(row.title);
    setDraftDescription(row.description ?? '');
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editing || !draftTitle.trim()) return;
    await patch(
      editing,
      { title: draftTitle.trim(), description: draftDescription.trim() || null },
      'Pembayaran telah dikemas kini.',
    );
    setEditing(null);
  }, [draftDescription, draftTitle, editing, patch]);

  if (accessLoading || loading) return <LoadingScreen />;

  if (!canView) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Pembayaran Adhoc" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Modul Pembayaran Adhoc memerlukan kebenaran melihat pada department BENDAHARI."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Admin"
        title="Pembayaran Adhoc"
        subtitle="Dipapar di tab Pembayaran setiap ahli"
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

        {canEdit ? (
          <Button
            label="+ Tambah Pembayaran"
            onPress={() => router.push('/(app)/admin/adhoc-payment-create')}
          />
        ) : (
          <Notice tone="info" message="Anda hanya mempunyai akses Lihat. Senarai di bawah adalah paparan sahaja." />
        )}

        <View className="pb-8">
          <SectionTitle
            title={'Senarai Pembayaran (' + rows.length + ')'}
            caption="Ahli melihat yang aktif sahaja. Tiada lejar — wang masuk terus melalui DuitNow."
          />

          {rows.length === 0 ? (
            <EmptyState
              icon="qr-code-outline"
              title="Belum ada pembayaran"
              description="Tabung atau infaq yang dicipta akan muncul di sini dan di tab Pembayaran setiap ahli."
            />
          ) : (
            <View className="gap-2">
              {rows.map((row) => {
                const busy = busyId === row.id;
                return (
                  <View key={row.id} className="gap-3 rounded-field border border-line bg-surface p-4">
                    <View className="flex-row items-center gap-3">
                      {row.qr_image_url ? (
                        <Image
                          source={{ uri: row.qr_image_url }}
                          style={{ width: THUMB, height: THUMB, borderRadius: 12 }}
                          contentFit="contain"
                          transition={150}
                          accessibilityLabel={'Kod QR ' + row.title}
                        />
                      ) : (
                        <View
                          style={{ width: THUMB, height: THUMB }}
                          className="items-center justify-center rounded-field bg-background">
                          <Text className="text-xs text-ink-faint">Tiada QR</Text>
                        </View>
                      )}

                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-ink" numberOfLines={2}>
                          {row.title}
                        </Text>
                        <Text className="mt-0.5 text-xs text-ink-muted" numberOfLines={1}>
                          {row.description ?? 'Tiada penerangan'}
                        </Text>
                      </View>

                      <Badge
                        label={row.is_active ? 'Aktif' : 'Tidak aktif'}
                        tone={row.is_active ? 'positive' : 'neutral'}
                      />
                    </View>

                    {/*
                      Rekod tanpa kod QR tetap boleh disimpan dan dihidupkan —
                      bendahari selalunya membuka tabung dahulu dan menerima QR
                      daripada bank beberapa hari kemudian. Amaran ini
                      memberitahunya apa yang ahli akan lihat sementara itu.
                    */}
                    {!row.qr_image_url && row.is_active ? (
                      <Notice
                        tone="info"
                        message="Belum ada kod QR — ahli melihat tajuk dan penerangan sahaja."
                      />
                    ) : null}

                    {canEdit ? (
                      <View className="flex-row flex-wrap gap-2">
                        <ActionChip
                          label={row.is_active ? 'Matikan' : 'Hidupkan'}
                          disabled={busy}
                          onPress={() =>
                            void patch(
                              row,
                              { is_active: !row.is_active },
                              row.is_active ? 'Pembayaran dimatikan.' : 'Pembayaran dihidupkan.',
                            )
                          }
                        />
                        <ActionChip label="Sunting" disabled={busy} onPress={() => startEdit(row)} />
                        <ActionChip
                          label={row.qr_image_url ? 'Tukar QR' : 'Muat Naik QR'}
                          disabled={busy}
                          onPress={() => void changeQr(row)}
                        />
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
        title="Padam pembayaran?"
        message={
          pendingDelete
            ? '"' + pendingDelete.title + '" akan dipadam dan hilang dari tab Pembayaran setiap ahli.'
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
