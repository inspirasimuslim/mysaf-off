import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Panel, SummaryStrip, ValueBars } from '@/components/stat-charts';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { usePerkaderanAccess } from '@/lib/department-access';
import { toMalayErrorVerbose } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import {
  fetchPrestasiMadU,
  fetchPrestasiRingkasan,
  pct,
  type PrestasiMadU,
  type PrestasiRingkasan,
} from '@/lib/perkaderan-program';
import { usePermissions } from '@/lib/permissions';
import { useColors } from '@/lib/theme';

const fmt = (v: number | null) => (v == null ? '—' : Math.round(v) + '%');

/**
 * Prestasi Pra-Keahlian — HANYA admin Lajnah Perkaderan dan Super Admin. Mengukur kemajuan
 * terhadap sasaran program (kehadiran sebenar / sesi yang telah berlangsung), bukan pemeringkatan
 * antara pelajar. Ujian akan ditambah selepas mekanismenya ditetapkan.
 */
export default function PerkaderanPrestasiScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const colors = useColors();
  const { loading: permLoading, isSuperAdmin } = usePermissions();
  const { loading: accessLoading, canView } = usePerkaderanAccess();
  const allowed = isSuperAdmin() || canView;

  const [ringkasan, setRingkasan] = useState<PrestasiRingkasan | null>(null);
  const [madU, setMadU] = useState<PrestasiMadU[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, m] = await Promise.all([fetchPrestasiRingkasan(null), fetchPrestasiMadU(null)]);
      setRingkasan(r);
      setMadU(m);
    } catch (caught) {
      setError(toMalayErrorVerbose(caught, 'Gagal memuatkan prestasi.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!permLoading && !accessLoading && allowed) void load();
  }, [accessLoading, allowed, load, permLoading]);

  if (permLoading || accessLoading) return <LoadingScreen />;
  if (!allowed) {
    return <NoAccessScreen title="Prestasi Pra-Keahlian" description="Prestasi mad'u hanya untuk admin Lajnah Perkaderan dan Super Admin." />;
  }
  if (loading) return <LoadingScreen />;

  const q = search.trim().toLowerCase();
  const list = madU.filter((m) => !q || m.nama.toLowerCase().includes(q) || m.sekolah.toLowerCase().includes(q));

  return (
    <Screen padTop={false}>
      <ScreenHeader title="Prestasi Pra-Keahlian" onBackPress={goBack} />
      <View className="gap-4 px-gutter pb-10">
        {error ? <Notice tone="negative" message={error} /> : null}
        {!ringkasan?.program ? (
          <EmptyState icon="stats-chart-outline" title="Belum ada program" description="Cipta program dan tarikh tamrin di Program & Tamrin dahulu." />
        ) : (
          <>
            <Text className="text-sm text-ink-muted">{ringkasan.program.nama} · sasaran {ringkasan.program.sasaran_usrah} sesi usrah</Text>
            <SummaryStrip
              items={[
                { value: String(ringkasan.jumlah_madu), label: "mad'u aktif" },
                { value: fmt(ringkasan.usrah_pct), label: 'kehadiran usrah' },
                { value: fmt(ringkasan.tamrin_pct), label: 'kehadiran tamrin' },
              ]}
            />

            <Panel title="Kehadiran usrah mengikut bulan" caption="Peratus hadir daripada peluang hadir" full>
              <ValueBars
                format={(v) => Math.round(v) + '%'}
                rows={ringkasan.bulanan.map((b) => ({
                  key: b.bulan,
                  label: b.bulan,
                  value: pct(b.hadir, b.peluang) ?? 0,
                  fill: (pct(b.hadir, b.peluang) ?? 0) / 100,
                  display: fmt(pct(b.hadir, b.peluang)),
                  note: b.sesi + ' sesi',
                }))}
              />
            </Panel>

            <Panel title="Kehadiran tamrin" caption="Mad'u hadir setiap tamrin yang telah berlangsung" full>
              {ringkasan.tamrin.length === 0 ? (
                <Text className="text-sm text-ink-muted">Belum ada tamrin yang berlangsung.</Text>
              ) : (
                <ValueBars
                  format={(v) => Math.round(v) + '%'}
                  rows={ringkasan.tamrin.map((t) => ({
                    key: t.id,
                    label: t.nama,
                    value: pct(t.hadir, t.jumlah) ?? 0,
                    fill: (pct(t.hadir, t.jumlah) ?? 0) / 100,
                    display: fmt(pct(t.hadir, t.jumlah)),
                    note: t.hadir + '/' + t.jumlah,
                  }))}
                />
              )}
            </Panel>

            <Panel title="Mengikut sekolah" caption="Purata kehadiran usrah" full>
              <ValueBars
                format={(v) => Math.round(v) + '%'}
                rows={ringkasan.sekolah.map((s) => ({
                  key: s.sekolah,
                  label: s.sekolah,
                  value: s.usrah_pct ?? 0,
                  fill: (s.usrah_pct ?? 0) / 100,
                  display: fmt(s.usrah_pct),
                  note: s.madu + " mad'u",
                }))}
              />
            </Panel>

            <Panel title="Setiap mad'u" caption="Ketik untuk lihat perincian dan carta" full>
              <TextField label="Cari nama atau sekolah" value={search} onChangeText={setSearch} />
              <View className="mt-3 gap-2">
                {list.map((m) => {
                  const u = pct(m.usrah_hadir, m.usrah_jumlah);
                  const t = pct(m.tamrin_hadir, m.tamrin_jumlah);
                  return (
                    <Pressable
                      key={m.mad_u_id}
                      accessibilityRole="button"
                      onPress={() => router.push({ pathname: '/(app)/admin/perkaderan-prestasi-madu', params: { id: m.mad_u_id } })}
                      className="rounded-card border border-line p-3">
                      <Text className="text-base font-semibold text-ink">{m.nama}</Text>
                      <Text className="text-xs text-ink-muted">{m.sekolah} · {m.tingkatan}{m.kelas ? ' ' + m.kelas : ''}</Text>
                      <Text className="mt-1 text-xs" style={{ color: colors.ink }}>
                        Usrah {m.usrah_hadir}/{m.usrah_jumlah} ({fmt(u)}) · Tamrin {m.tamrin_hadir}/{m.tamrin_jumlah} ({fmt(t)})
                      </Text>
                    </Pressable>
                  );
                })}
                {list.length === 0 ? <Text className="text-sm text-ink-muted">Tiada padanan.</Text> : null}
              </View>
            </Panel>
          </>
        )}
      </View>
    </Screen>
  );
}
