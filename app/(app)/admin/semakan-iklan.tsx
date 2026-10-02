import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { ToastBanner } from '@/components/ui/toast';
import {
  businessAdError,
  deleteBusinessAd,
  fetchPendingBusinessAds,
  reviewBusinessAd,
  type PendingBusinessAd,
} from '@/lib/business-ads';
import { EKONOMI_DEPARTMENT, useDepartmentAccess } from '@/lib/department-access';
import { useGoBack } from '@/lib/navigation';

const DEFAULT_DURATION = '30';
const MAX_QUEUE = 20;

type Mode = 'lulus' | 'tolak';

/**
 * Semakan Iklan Perniagaan — LAJNAH EKONOMI DAN ASET + Super Admin.
 *
 * Lihat senarai = `can_view` (sepadan `can_view_business_ads_admin()`); Lulus/
 * Tolak = `can_edit` (sepadan `can_review_business_ads()`, disemak semula
 * dalam `review_business_ad()`). Admin paparan sahaja nampak queue tanpa
 * butang tindakan.
 */
export default function SemakanIklanScreen() {
  const goBack = useGoBack();
  const { loading: accessLoading, canView, canEdit } = useDepartmentAccess(EKONOMI_DEPARTMENT);

  const [rows, setRows] = useState<PendingBusinessAd[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // Satu baris dibuka untuk tindakan pada satu masa.
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('lulus');
  const [durasi, setDurasi] = useState(DEFAULT_DURATION);
  const [sebab, setSebab] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Padam terus — berasingan daripada aliran Lulus/Tolak di atas.
  const [deleteTarget, setDeleteTarget] = useState<PendingBusinessAd | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchPendingBusinessAds());
      setError(null);
    } catch (caught) {
      setError(businessAdError(caught, 'Gagal memuatkan senarai iklan.'));
    }
  }, []);

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

  const open = (id: string, next: Mode) => {
    setOpenId(id);
    setMode(next);
    setDurasi(DEFAULT_DURATION);
    setSebab('');
    setActionError(null);
  };

  const confirm = async (ad: PendingBusinessAd) => {
    if (busy) return;
    setActionError(null);

    let decision: Parameters<typeof reviewBusinessAd>[1];
    if (mode === 'lulus') {
      const days = Number(durasi);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        return setActionError('Durasi mesti nombor bulat 1 hingga 365 hari.');
      }
      decision = { keputusan: 'diluluskan', durasiHari: days };
    } else {
      decision = { keputusan: 'ditolak', sebab: sebab.trim() };
    }

    setBusy(true);
    try {
      await reviewBusinessAd(ad.id, decision);
      setOpenId(null);
      setBanner(mode === 'lulus' ? 'Iklan "' + ad.nama_bisnes + '" diluluskan.' : 'Iklan "' + ad.nama_bisnes + '" ditolak.');
      await load();
    } catch (caught) {
      setActionError(businessAdError(caught, 'Gagal menyimpan keputusan.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteAd = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteBusinessAd(deleteTarget.id);
      setBanner('Iklan "' + deleteTarget.nama_bisnes + '" dipadam.');
      setDeleteTarget(null);
      await load();
    } catch (caught) {
      setDeleteError(businessAdError(caught, 'Gagal memadam iklan.'));
    } finally {
      setDeleting(false);
    }
  };

  if (accessLoading) return <LoadingScreen />;

  if (!canView) {
    return (
      <NoAccessScreen
        title="Semakan Iklan"
        description="Skrin ini khusus untuk admin LAJNAH EKONOMI DAN ASET dan Super Admin."
      />
    );
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Lajnah Ekonomi dan Aset"
        title="Semakan Iklan"
        subtitle={rows ? 'Queue: ' + (rows[0]?.queue_used ?? '—') + ' / ' + MAX_QUEUE + ' slot digunakan' : undefined}
        onBackPress={goBack}
      />

      <View className="gap-4 px-gutter pb-8 pt-5">
        {banner ? <ToastBanner tone="positive" message={banner} /> : null}
        {error ? <Notice tone="negative" message={error} /> : null}
        {!canEdit ? <Notice tone="info" message="Anda hanya boleh melihat queue. Kelulusan memerlukan kebenaran sunting." /> : null}

        {rows === null && !error ? <LoadingScreen /> : null}

        {rows && rows.length === 0 ? (
          <EmptyState icon="checkmark-done-outline" title="Tiada iklan menunggu" description="Semua iklan sudah disemak." />
        ) : null}

        {(rows ?? []).map((ad) => (
          <Card key={ad.id} className="gap-3">
            <Image
              source={{ uri: ad.url_poster }}
              style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 16 }}
              contentFit="contain"
              accessibilityLabel={'Poster ' + ad.nama_bisnes}
            />
            <Text className="text-base font-bold text-ink">{ad.nama_bisnes}</Text>
            <Text className="text-sm text-ink-muted">
              {ad.nama_pemilik}
              {ad.no_keahlian ? ' · ' + ad.no_keahlian : ''} · WhatsApp {ad.no_whatsapp}
            </Text>
            {ad.penerangan ? <Text className="text-sm leading-5 text-ink">{ad.penerangan}</Text> : null}
            {ad.teks_cta ? <Text className="text-sm text-ink-muted">Butang: {ad.teks_cta}</Text> : null}
            <Text className="text-xs text-ink-faint">Dihantar {new Date(ad.submitted_at).toLocaleString('ms-MY')}</Text>

            {canEdit && openId !== ad.id ? (
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button label="Lulus" size="sm" onPress={() => open(ad.id, 'lulus')} />
                </View>
                <View className="flex-1">
                  <Button label="Tolak" size="sm" variant="danger" onPress={() => open(ad.id, 'tolak')} />
                </View>
              </View>
            ) : null}

            {canEdit && openId !== ad.id ? (
              <Button label="Padam Terus" size="sm" variant="ghost" onPress={() => setDeleteTarget(ad)} />
            ) : null}

            {canEdit && openId === ad.id ? (
              <View className="gap-3">
                {mode === 'lulus' ? (
                  <TextField
                    label="Durasi paparan (hari, 1–365)"
                    value={durasi}
                    onChangeText={setDurasi}
                    keyboardType="number-pad"
                    editable={!busy}
                  />
                ) : (
                  <TextField
                    label="Sebab ditolak (dipaparkan kepada pemilik)"
                    value={sebab}
                    onChangeText={setSebab}
                    multiline
                    maxLength={500}
                    editable={!busy}
                  />
                )}
                {actionError ? <Notice tone="negative" message={actionError} /> : null}
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Button label="Batal" size="sm" variant="secondary" onPress={() => setOpenId(null)} disabled={busy} />
                  </View>
                  <View className="flex-1">
                    <Button
                      label={mode === 'lulus' ? 'Sahkan Lulus' : 'Sahkan Tolak'}
                      size="sm"
                      variant={mode === 'lulus' ? 'primary' : 'danger'}
                      loading={busy}
                      onPress={() => void confirm(ad)}
                    />
                  </View>
                </View>
              </View>
            ) : null}
          </Card>
        ))}
      </View>

      {deleteError ? (
        <View className="px-gutter pb-4">
          <Notice tone="negative" message={deleteError} />
        </View>
      ) : null}

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Padam iklan ini?"
        message={
          deleteTarget
            ? 'Iklan "' + deleteTarget.nama_bisnes + '" (' + deleteTarget.nama_pemilik + ') akan dipadam kekal, termasuk poster.'
            : ''
        }
        confirmLabel="Padam"
        destructive
        busy={deleting}
        onConfirm={() => void confirmDeleteAd()}
        onCancel={() => setDeleteTarget(null)}
      />
    </Screen>
  );
}
