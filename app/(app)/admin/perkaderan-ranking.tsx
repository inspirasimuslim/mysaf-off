import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { usePerkaderanAccess } from '@/lib/department-access';
import { toMalayErrorVerbose } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { fetchRanking3K, type RankingRow } from '@/lib/perkaderan-program';
import { usePermissions } from '@/lib/permissions';
import { TINGKATAN_OPTIONS } from '@/types/database';

const W = { no: 34, nama: 190, sek: 150, kump: 52, usrah: 64, tamrin: 62, mata: 52 };
const TABLE_W = W.no + W.nama + W.sek + W.kump + W.usrah + W.tamrin * 3 + W.mata + 16;

/**
 * Ranking kelayakan Tamrin 3K — admin Lajnah Perkaderan / Super Admin sahaja. 1 item = 1 mata:
 * setiap usrah dihadiri + TAQ + TAMPENOR + QTC. Data terus daripada kehadiran usrah naqib dan
 * kehadiran tamrin (RPC `perkaderan_ranking_3k`), jadi kumpulan/mad'u baharu masuk sendiri.
 */
export default function PerkaderanRankingScreen() {
  const goBack = useGoBack();
  const { loading: permLoading, isSuperAdmin } = usePermissions();
  const { loading: accessLoading, canView } = usePerkaderanAccess();
  const allowed = isSuperAdmin() || canView;

  const [tingkatan, setTingkatan] = useState<string>('Tingkatan 5');
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async (t: string) => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchRanking3K(t));
    } catch (caught) {
      setError(toMalayErrorVerbose(caught, 'Gagal memuatkan ranking.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!permLoading && !accessLoading && allowed) void load(tingkatan);
  }, [accessLoading, allowed, load, permLoading, tingkatan]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => !q || r.nama.toLowerCase().includes(q) || r.sekolah.toLowerCase().includes(q));
  }, [rows, search]);

  if (permLoading || accessLoading) return <LoadingScreen />;
  if (!allowed) {
    return <NoAccessScreen title="Ranking Tamrin 3K" description="Hanya untuk admin Lajnah Perkaderan dan Super Admin." />;
  }

  return (
    <Screen padTop={false} wide>
      <ScreenHeader title="Ranking Tamrin 3K" subtitle={shown.length + " mad'u"} onBackPress={goBack} />
      <View className="gap-4 px-gutter pb-10 pt-4">
        {error ? <Notice tone="negative" message={error} /> : null}
        <PickerField label="Tingkatan" value={tingkatan} options={TINGKATAN_OPTIONS} onChange={(v) => v && setTingkatan(v)} clearable={false} />
        <TextField label="Cari" placeholder="Nama atau sekolah" value={search} onChangeText={setSearch} />
        <Text className="text-xs text-ink-muted">
          1 item = 1 mata: setiap usrah dihadiri, ditambah TAQ, TAMPENOR dan QTC. Contoh 5 usrah + TAQ + QTC = 7 mata. Mad'u dengan mata tertinggi di atas.
        </Text>
        {loading ? (
          <LoadingScreen />
        ) : shown.length === 0 ? (
          <EmptyState icon="people-outline" title="Tiada mad'u" description="Tiada mad'u aktif untuk tingkatan ini." />
        ) : (
          <View className="overflow-hidden rounded-card border border-line bg-surface">
            <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
              <View style={{ width: TABLE_W }}>
                <View className="flex-row border-b border-line bg-primary-tint px-2 py-1.5">
                  <Text style={{ width: W.no }} className="text-[11px] font-semibold text-ink-muted">#</Text>
                  <Text style={{ width: W.nama }} className="text-[11px] font-semibold text-ink-muted">Nama</Text>
                  <Text style={{ width: W.sek }} className="text-[11px] font-semibold text-ink-muted">Sekolah</Text>
                  <Text style={{ width: W.kump }} className="text-[11px] font-semibold text-ink-muted">Kump.</Text>
                  <Text style={{ width: W.usrah }} className="text-[11px] font-semibold text-ink-muted">Usrah</Text>
                  <Text style={{ width: W.tamrin }} className="text-[11px] font-semibold text-ink-muted">TAQ</Text>
                  <Text style={{ width: W.tamrin }} className="text-[11px] font-semibold text-ink-muted">TAMPENOR</Text>
                  <Text style={{ width: W.tamrin }} className="text-[11px] font-semibold text-ink-muted">QTC</Text>
                  <Text style={{ width: W.mata }} className="text-[11px] font-semibold text-ink-muted">Mata</Text>
                </View>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 560 }}>
                  {shown.map((r, i) => (
                    <View key={r.mad_u_id} className="flex-row items-center border-t border-line px-2 py-1.5">
                      <Text style={{ width: W.no }} className="text-xs text-ink-muted">{i + 1}</Text>
                      <Text style={{ width: W.nama }} className="pr-2 text-xs font-semibold text-ink" numberOfLines={2}>{r.nama}</Text>
                      <Text style={{ width: W.sek }} className="pr-2 text-xs text-ink-muted" numberOfLines={2}>{r.sekolah}</Text>
                      <Text style={{ width: W.kump }} className="text-xs text-ink">{r.no_kumpulan ?? '—'}</Text>
                      <Text style={{ width: W.usrah }} className="text-xs text-ink">{r.usrah_hadir + '/' + r.usrah_jumlah}</Text>
                      {[r.taq, r.tampenor, r.qtc].map((v, k) => (
                        <Text key={k} style={{ width: W.tamrin }} className={'text-sm ' + (v ? 'font-bold text-positive' : 'text-ink-faint')}>
                          {v ? '✓' : '–'}
                        </Text>
                      ))}
                      <Text style={{ width: W.mata }} className="text-sm font-bold text-primary">{r.mata}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            </ScrollView>
          </View>
        )}
      </View>
    </Screen>
  );
}
