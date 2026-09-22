import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { SaveShareButtons } from '@/components/save-share-buttons';
import { ScreenHeader } from '@/components/screen-header';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { Colors } from '@/constants/theme';
import { usePerkaderanAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { deliveryMessage, type DeliveryMode } from '@/lib/file-delivery';
import { useGoBack } from '@/lib/navigation';
import { fetchAllGroupsSummary } from '@/lib/perkaderan';
import { downloadPerkaderanReport } from '@/lib/perkaderan-report';
import type { UsrahGroupSummary } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

export default function PerkaderanGroupsScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { loading: accessLoading, canView } = usePerkaderanAccess();

  const [groups, setGroups] = useState<UsrahGroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);
  const [exporting, setExporting] = useState<DeliveryMode | null>(null);

  const load = useCallback(async () => {
    try {
      setGroups(await fetchAllGroupsSummary());
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan senarai kumpulan.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accessLoading || !canView) return;
    void load();
  }, [accessLoading, canView, load]);

  const exportAll = useCallback(
    async (mode: DeliveryMode) => {
      if (exporting) return;

      setBanner(null);
      setExporting(mode);
      try {
        const report = await downloadPerkaderanReport(null, null, mode);
        setBanner({
          tone: report.result === 'cancelled' ? 'info' : 'positive',
          message: deliveryMessage(report.result, report.fileName, report.rows + ' sesi'),
        });
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menjana laporan.') });
      } finally {
        setExporting(null);
      }
    },
    [exporting],
  );

  if (accessLoading || loading) return <LoadingScreen />;

  if (!canView) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Pantauan Usrah Sekolah" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Pantauan usrah sekolah memerlukan kebenaran melihat pada department LAJNAH PERKADERAN."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Admin"
        title="Pantauan Usrah Sekolah"
        subtitle={groups.length + ' kumpulan merentasi semua naqib'}
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

        <View>
          <SectionTitle title="Senarai Kumpulan" caption="Ketuk satu kumpulan untuk lihat mad'u dan sesinya." />

          {groups.length === 0 ? (
            <EmptyState
              icon="school-outline"
              title="Belum ada kumpulan"
              description="Kumpulan usrah sekolah akan muncul di sini sebaik naqib mencipta kumpulan pertamanya."
            />
          ) : (
            <View className="gap-2">
              {groups.map((group) => (
                <Pressable
                  key={group.id}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/(app)/admin/perkaderan-group-detail', params: { id: group.id } })}
                  className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-card active:opacity-70">
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-ink">{group.naqib_full_name}</Text>
                    <Text className="mt-0.5 text-sm text-ink-muted">{group.sekolah}</Text>
                    <Text className="mt-1 text-xs text-ink-faint">
                      {group.mad_u_count + " mad'u aktif · " + group.session_count + ' sesi'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.inkMuted} />
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View className="pb-8">
          <SectionTitle title="Muat Turun Laporan" caption="Ringkasan sesi dan kehadiran terperinci semua kumpulan (.xlsx)." />
          <Card>
            <SaveShareButtons
              kind="file"
              variant="secondary"
              webLabel="Muat Turun Laporan (.xlsx)"
              nativeCaption="Laporan Usrah Sekolah (.xlsx)"
              busy={exporting}
              onPress={(mode) => void exportAll(mode)}
            />
          </Card>
        </View>
      </View>
    </Screen>
  );
}
