import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { TextField } from '@/components/ui/text-field';
import { ToastBanner } from '@/components/ui/toast';
import {
  businessAdError,
  deleteBusinessAd,
  fetchAllBusinessAdsAdmin,
  reviewBusinessAd,
  type AdminBusinessAd,
  type BusinessAdStatus,
} from '@/lib/business-ads';
import { EKONOMI_DEPARTMENT, useDepartmentAccess } from '@/lib/department-access';
import { useGoBack } from '@/lib/navigation';

const DEFAULT_DURATION = '30';
const MAX_QUEUE = 20;

type Mode = 'lulus' | 'tolak';
type Tab = 'menunggu' | 'semua';

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: 'menunggu', label: 'Menunggu' },
  { value: 'semua', label: 'Semua Iklan' },
];

const STATUS_LABEL: Record<BusinessAdStatus, { label: string; tone: 'warn' | 'negative' | 'neutral' | 'positive' }> = {
  menunggu: { label: 'Pending', tone: 'warn' },
  diluluskan: { label: 'Aktif', tone: 'positive' },
  ditolak: { label: 'Ditolak', tone: 'negative' },
  tamat_tempoh: { label: 'Tamat Tempoh', tone: 'neutral' },
};

/**
 * Semakan Iklan Perniagaan — LAJNAH EKONOMI DAN ASET + Super Admin.
 *
 * Lihat senarai = `can_view` (sepadan `can_view_business_ads_admin()`); Lulus/
 * Tolak/Padam = `can_edit` (sepadan `can_review_business_ads()`, disemak
 * semula dalam RPC masing-masing). Admin paparan sahaja nampak senarai tanpa
 * butang tindakan.
 *
 * Satu RPC (`list_all_business_ads_admin`) memberi SEMUA status — tab
 * "Menunggu" (lalai) menapis status itu sahaja secara tempatan, tab "Semua
 * Iklan" memaparkan kesemuanya supaya admin boleh memadam iklan yang sudah
 * diluluskan/ditolak/tamat tempoh (butang Padam sebelum ini hanya kelihatan
 * untuk status 'menunggu').
 */
export default function SemakanIklanScreen() {
  const goBack = useGoBack();
  const { loading: accessLoading, canView, canEdit } = useDepartmentAccess(EKONOMI_DEPARTMENT);

  const [tab, setTab] = useState<Tab>('menunggu');
  const [allRows, setAllRows] = useState<AdminBusinessAd[] | null>(null);
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
  const [deleteTarget, setDeleteTarget] = useState<AdminBusinessAd | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setAllRows(await fetchAllBusinessAdsAdmin());
      setError(null);
    } catch (caught) {
      setError(businessAdError(caught, 'Gagal memuatkan senarai iklan.'));
    }
  }, []);

  const pendingRows = useMemo(() => (allRows ?? []).filter((row) => row.status_paparan === 'menunggu'), [allRows]);
  const rows = tab === 'menunggu' ? (allRows === null ? null : pendingRows) : allRows;
  // Sepadan business_ads_queue_used(): menunggu + diluluskan-aktif (tamat_tempoh sudah dikira semula di RPC).
  const queueUsed = (allRows ?? []).filter((row) => row.status_paparan === 'menunggu' || row.status_paparan === 'diluluskan').length;

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

  const confirm = async (ad: AdminBusinessAd) => {
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
      void load();
    } catch (caught) {
      setActionError(businessAdError(caught, 'Gagal menyimpan keputusan.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteAd = async () => {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteBusinessAd(target.id);
      setBanner('Iklan "' + target.nama_bisnes + '" dipadam.');
      setDeleteTarget(null);
      // Muat semula senarai BERASINGAN daripada status "deleting" — jika ia
      // perlahan/tersekat, butang Padam untuk iklan seterusnya tidak patut
      // terkunci dalam keadaan loading sehingga perlu restart app (bug
      // dilaporkan 2026-10-03).
      void load();
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
        subtitle={allRows ? 'Queue: ' + queueUsed + ' / ' + MAX_QUEUE + ' slot digunakan' : undefined}
        onBackPress={goBack}
      />

      <View className="gap-4 px-gutter pb-8 pt-5">
        <Segmented value={tab} options={TAB_OPTIONS} onChange={setTab} compact />

        {banner ? <ToastBanner tone="positive" message={banner} /> : null}
        {error ? <Notice tone="negative" message={error} /> : null}
        {!canEdit ? (
          <Notice tone="info" message="Anda hanya boleh melihat senarai. Kelulusan dan pemadaman memerlukan kebenaran sunting." />
        ) : null}

        {rows === null && !error ? <LoadingScreen /> : null}

        {rows && rows.length === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title={tab === 'menunggu' ? 'Tiada iklan menunggu' : 'Tiada iklan'}
            description={tab === 'menunggu' ? 'Semua iklan sudah disemak.' : 'Belum ada iklan dihantar.'}
          />
        ) : null}

        {(rows ?? []).map((ad) => {
          const status = STATUS_LABEL[ad.status_paparan];
          return (
            <Card key={ad.id} className="gap-3">
              <Image
                source={{ uri: ad.url_poster }}
                style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 16 }}
                contentFit="contain"
                accessibilityLabel={'Poster ' + ad.nama_bisnes}
              />
              <View className="flex-row items-start justify-between gap-2">
                <Text className="flex-1 text-base font-bold text-ink">{ad.nama_bisnes}</Text>
                {tab === 'semua' ? <Badge label={status.label} tone={status.tone} /> : null}
              </View>
              <Text className="text-sm text-ink-muted">
                {ad.nama_pemilik}
                {ad.no_keahlian ? ' · ' + ad.no_keahlian : ''} · WhatsApp {ad.no_whatsapp}
              </Text>
              {ad.penerangan ? <Text className="text-sm leading-5 text-ink">{ad.penerangan}</Text> : null}
              {ad.teks_cta ? <Text className="text-sm text-ink-muted">Butang: {ad.teks_cta}</Text> : null}
              {ad.status_paparan === 'ditolak' && ad.sebab_tolak ? (
                <Text className="text-sm text-negative">Sebab ditolak: {ad.sebab_tolak}</Text>
              ) : null}
              <Text className="text-xs text-ink-faint">Dihantar {new Date(ad.submitted_at).toLocaleString('ms-MY')}</Text>

              {canEdit && ad.status_paparan === 'menunggu' && openId !== ad.id ? (
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
          );
        })}
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
