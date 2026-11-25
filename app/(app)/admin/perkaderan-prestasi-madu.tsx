import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Panel, SplitBar, SummaryStrip } from '@/components/stat-charts';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { usePerkaderanAccess } from '@/lib/department-access';
import { toMalayErrorVerbose } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { fetchPrestasiDetail, pct, type PrestasiDetail } from '@/lib/perkaderan-program';
import { usePermissions } from '@/lib/permissions';
import { useColors } from '@/lib/theme';

function dateLabel(value: string): string {
  const d = new Date(value + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('ms-MY', { day: 'numeric', month: 'short' });
}

/** Prestasi seorang mad'u: usrah dan tamrin yang berlangsung selepas dia ditambah, hadir/tidak. Admin Lajnah / Super Admin sahaja. */
export default function PerkaderanPrestasiMaduScreen() {
  const goBack = useGoBack();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { loading: permLoading, isSuperAdmin } = usePermissions();
  const { loading: accessLoading, canView } = usePerkaderanAccess();
  const allowed = isSuperAdmin() || canView;

  const [detail, setDetail] = useState<PrestasiDetail>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (permLoading || accessLoading || !allowed || !id) return;
    fetchPrestasiDetail(id)
      .then(setDetail)
      .catch((caught) => setError(toMalayErrorVerbose(caught, 'Gagal memuatkan prestasi.')))
      .finally(() => setLoading(false));
  }, [accessLoading, allowed, id, permLoading]);

  if (permLoading || accessLoading) return <LoadingScreen />;
  if (!allowed) return <NoAccessScreen title="Prestasi Mad'u" description="Hanya untuk admin Lajnah Perkaderan dan Super Admin." />;
  if (loading) return <LoadingScreen />;

  const usrahHadir = detail?.usrah.filter((u) => u.hadir).length ?? 0;
  const usrahJumlah = detail?.usrah.length ?? 0;
  const tamrinHadir = detail?.tamrin.filter((t) => t.hadir).length ?? 0;
  const tamrinJumlah = detail?.tamrin.length ?? 0;
  const sasaran = detail?.sasaran_usrah ?? 0;

  return (
    <Screen padTop={false}>
      <ScreenHeader title={detail?.mad_u.nama ?? "Prestasi Mad'u"} onBackPress={goBack} />
      <View className="gap-4 px-gutter pb-10">
        {error ? <Notice tone="negative" message={error} /> : null}
        {!detail ? (
          <EmptyState icon="person-outline" title="Tidak dijumpai" description="Mad'u ini tiada atau telah dipadam." />
        ) : (
          <>
            <Text className="text-sm text-ink-muted">
              {detail.mad_u.sekolah} · {detail.mad_u.tingkatan}
              {detail.mad_u.kelas ? ' ' + detail.mad_u.kelas : ''} · {detail.mad_u.group_name}
            </Text>
            <SummaryStrip
              items={[
                { value: usrahHadir + '/' + usrahJumlah, label: 'usrah' },
                { value: tamrinHadir + '/' + tamrinJumlah, label: 'tamrin' },
                ...(sasaran > 0 ? [{ value: usrahHadir + '/' + sasaran, label: 'sasaran usrah' }] : []),
              ]}
            />

            <Panel title="Usrah" caption={'Kehadiran ' + (pct(usrahHadir, usrahJumlah) ?? 0) + '%'} full>
              <SplitBar
                format={(v) => String(v)}
                parts={[
                  { label: 'Hadir', value: usrahHadir, color: colors.primaryMid },
                  { label: 'Tidak hadir', value: usrahJumlah - usrahHadir, color: colors.line },
                ]}
              />
              <View className="mt-3 gap-1">
                {detail.usrah.map((u) => (
                  <Text key={u.tarikh} className="text-sm text-ink">
                    {u.hadir ? '✓' : '✗'} {dateLabel(u.tarikh)}{u.topik ? ' — ' + u.topik : ''}
                  </Text>
                ))}
              </View>
            </Panel>

            <Panel title="Tamrin" caption={'Kehadiran ' + (pct(tamrinHadir, tamrinJumlah) ?? 0) + '%'} full>
              <SplitBar
                format={(v) => String(v)}
                parts={[
                  { label: 'Hadir', value: tamrinHadir, color: colors.primaryMid },
                  { label: 'Tidak hadir', value: tamrinJumlah - tamrinHadir, color: colors.line },
                ]}
              />
              <View className="mt-3 gap-1">
                {detail.tamrin.map((t) => (
                  <Text key={t.tarikh + t.nama} className="text-sm text-ink">
                    {t.hadir ? '✓' : '✗'} {dateLabel(t.tarikh)} — {t.nama}
                  </Text>
                ))}
              </View>
            </Panel>
          </>
        )}
      </View>
    </Screen>
  );
}
