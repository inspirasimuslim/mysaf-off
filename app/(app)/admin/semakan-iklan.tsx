import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import { BusinessAdListRow } from '@/components/business-ad-list-row';
import { NoAccessScreen } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { businessAdError, fetchAllBusinessAdsAdmin, type AdminBusinessAd } from '@/lib/business-ads';
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
 * Tiada butang Padam di sini: Tolak (dengan sebab yang dibaca pemilik) sudah
 * memadai untuk keputusan semakan; pemilik sendiri yang memadam iklannya.
 *
 * Lihat senarai = `can_view` (`can_view_business_ads_admin()`); tindakan di
 * skrin detail = `can_edit` (`can_review_business_ads()`).
 */
export default function SemakanIklanScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { loading: accessLoading, canView, canEdit } = useDepartmentAccess(EKONOMI_DEPARTMENT);

  const [tab, setTab] = useState<Tab>('menunggu');
  const [allRows, setAllRows] = useState<AdminBusinessAd[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

        {error ? <Notice tone="negative" message={error} /> : null}
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
            />
          ))}
        </View>
      </View>
    </Screen>
  );
}
