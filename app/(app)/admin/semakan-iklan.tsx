import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import { BusinessAdListRow } from '@/components/business-ad-list-row';
import { NoAccessScreen } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import {
  businessAdError,
  deleteBusinessAd,
  fetchAllBusinessAdsAdmin,
  type AdminBusinessAd,
} from '@/lib/business-ads';
import { EKONOMI_DEPARTMENT, useDepartmentAccess } from '@/lib/department-access';
import { useGoBack } from '@/lib/navigation';

const MAX_QUEUE = 20;

type Tab = 'menunggu' | 'semua';

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: 'menunggu', label: 'Menunggu' },
  { value: 'semua', label: 'Semua Iklan' },
];

/**
 * Semakan Iklan Perniagaan — LAJNAH EKONOMI DAN ASET + Super Admin.
 *
 * Senarai RINGKAS sahaja (sama corak Program Usrah) — tekan baris untuk buka
 * skrin detail penuh (`admin/iklan-detail`), di situlah Lulus/Tolak berada.
 * Tab "Menunggu": tiada butang Padam — Tolak (dengan sebab yang dibaca
 * pemilik) sudah memadai untuk keputusan semakan iklan baharu. Tab "Semua
 * Iklan" ADA butang Padam setiap baris (diminta admin 2026-10-03) — untuk
 * buang terus iklan aktif/tamat/ditolak lama tanpa perlu tunggu pemilik
 * padam sendiri; `delete_business_ad()` RPC sudah membenarkan
 * `can_review_business_ads()` memadam mana-mana iklan (bukan hanya pemilik).
 *
 * Lihat senarai = `can_view` (`can_view_business_ads_admin()`); tindakan di
 * skrin detail DAN butang Padam di sini = `can_edit` (`can_review_business_ads()`).
 *
 * Butang "+ Tambah Iklan" (migration 108, diminta 2026-10-03) — admin
 * menghantar iklan BAGI PIHAK ahli yang tidak mahir aplikasi; iklan itu
 * terus aktif dan TIDAK dikira dalam had queue/3-ahli (lihat
 * `admin/iklan-tambah.tsx`). Sama kebenaran `canEdit` seperti butang Padam.
 */
export default function SemakanIklanScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { loading: accessLoading, canView, canEdit } = useDepartmentAccess(EKONOMI_DEPARTMENT);

  const [tab, setTab] = useState<Tab>('menunggu');
  const [allRows, setAllRows] = useState<AdminBusinessAd[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  useFocusEffect(
    useCallback(() => {
      if (canView) void load();
    }, [canView, load]),
  );

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteBusinessAd(target.id);
      // Reset status SEBELUM apa-apa lain — senarai dimuat semula secara
      // berasingan (`void load()`), bukan `await` dalam blok yang sama
      // dengan reset status "deleting", supaya butang Padam baris
      // seterusnya tidak boleh terkunci loading jika muat semula ini
      // perlahan (bug sama dilaporkan pagi ini untuk iklan ke-2).
      setDeleteTarget(null);
      setDeleting(false);
      void load();
    } catch (caught) {
      setDeleteError(businessAdError(caught, 'Gagal memadam iklan.'));
      setDeleting(false);
    }
  };

  const pendingRows = useMemo(() => (allRows ?? []).filter((row) => row.status_paparan === 'menunggu'), [allRows]);
  const rows = tab === 'menunggu' ? (allRows === null ? null : pendingRows) : allRows;
  // Sepadan business_ads_queue_used(): menunggu + diluluskan-aktif (tamat_tempoh sudah dikira semula di RPC).
  const queueUsed = (allRows ?? []).filter((row) => row.status_paparan === 'menunggu' || row.status_paparan === 'diluluskan').length;

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

        {canEdit ? (
          <Button
            label="+ Tambah Iklan (Bagi Pihak Ahli)"
            variant="secondary"
            onPress={() => router.push('/(app)/admin/iklan-tambah')}
          />
        ) : null}

        {error ? <Notice tone="negative" message={error} /> : null}
        {deleteError ? <Notice tone="negative" message={deleteError} /> : null}
        {!canEdit ? (
          <Notice tone="info" message="Anda hanya boleh melihat senarai. Kelulusan dan penolakan memerlukan kebenaran sunting." />
        ) : null}

        {rows === null && !error ? <LoadingScreen /> : null}

        {rows && rows.length === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title={tab === 'menunggu' ? 'Tiada iklan menunggu' : 'Tiada iklan'}
            description={tab === 'menunggu' ? 'Semua iklan sudah disemak.' : 'Belum ada iklan dihantar.'}
          />
        ) : null}

        <View className="gap-2">
          {(rows ?? []).map((ad) => (
            <BusinessAdListRow
              key={ad.id}
              posterUrl={ad.url_poster}
              title={ad.nama_bisnes}
              subtitle={ad.nama_pemilik + (ad.no_keahlian ? ' · ' + ad.no_keahlian : '')}
              status={ad.status_paparan}
              onPress={() => router.push({ pathname: '/(app)/admin/iklan-detail', params: { id: ad.id } })}
              onDelete={tab === 'semua' && canEdit ? () => setDeleteTarget(ad) : undefined}
              deleting={deleting && deleteTarget?.id === ad.id}
            />
          ))}
        </View>
      </View>

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Padam iklan ini?"
        message={deleteTarget ? 'Iklan "' + deleteTarget.nama_bisnes + '" akan dipadam kekal, termasuk semua gambar. Tindakan ini tidak boleh diundur.' : ''}
        confirmLabel="Padam"
        destructive
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </Screen>
  );
}
