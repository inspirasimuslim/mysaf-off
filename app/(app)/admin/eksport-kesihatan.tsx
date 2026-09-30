import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
import { SaveShareButtons } from '@/components/save-share-buttons';
import { ScreenHeader } from '@/components/screen-header';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { ToastBanner } from '@/components/ui/toast';
import { KEBAJIKAN_DEPARTMENT, useDepartmentAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { deliveryMessage, type DeliveryMode } from '@/lib/file-delivery';
import { downloadHealthExport } from '@/lib/member-health-export';
import { useGoBack } from '@/lib/navigation';

/**
 * Eksport Data Kesihatan Ahli — admin LAJNAH KEBAJIKAN dan Super Admin sahaja.
 *
 * Kebenaran LIHAT department sudah memadai (eksport hanya membaca), dan
 * `members_export_kesihatan()` menyemaknya semula di pelayan. Sengaja bukan
 * sebahagian skrin Senarai Ahli — admin JABATAN DATA tidak mendapat akses.
 */
export default function EksportKesihatanScreen() {
  const goBack = useGoBack();
  const { loading, canView } = useDepartmentAccess(KEBAJIKAN_DEPARTMENT);

  const [exporting, setExporting] = useState<DeliveryMode | null>(null);
  const [banner, setBanner] = useState<{ tone: 'positive' | 'info' | 'negative'; message: string } | null>(null);

  const exportAll = useCallback(
    async (mode: DeliveryMode) => {
      if (exporting) return;
      setBanner(null);
      setExporting(mode);
      try {
        const report = await downloadHealthExport(mode);
        setBanner({
          tone: report.result === 'cancelled' ? 'info' : 'positive',
          message: deliveryMessage(report.result, report.fileName, report.rows + ' rekod'),
        });
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal mengeksport data kesihatan.') });
      } finally {
        setExporting(null);
      }
    },
    [exporting],
  );

  if (loading) return <LoadingScreen />;

  if (!canView) {
    return (
      <NoAccessScreen
        title="Eksport Data Kesihatan"
        description="Eksport ini khusus untuk admin LAJNAH KEBAJIKAN dan Super Admin."
      />
    );
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Lajnah Kebajikan"
        title="Eksport Data Kesihatan"
        subtitle="Satu baris setiap masalah kesihatan yang direkodkan ahli"
        onBackPress={goBack}
      />

      <View className="gap-4 px-gutter pb-8 pt-5">
        {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}
        <Notice
          tone="info"
          message="Fail ini mengandungi data kesihatan peribadi ahli. Simpan dengan selamat, gunakan untuk tujuan kebajikan sahaja dan jangan kongsi."
        />
        <SaveShareButtons
          kind="file"
          variant="secondary"
          webLabel="Muat Turun Data Kesihatan"
          nativeCaption="Data Kesihatan Ahli (.xlsx)"
          busy={exporting}
          onPress={(mode) => void exportAll(mode)}
        />
      </View>
    </Screen>
  );
}
