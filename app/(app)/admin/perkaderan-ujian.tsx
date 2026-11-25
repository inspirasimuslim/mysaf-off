import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { toMalayErrorVerbose } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { fetchUjian, fetchUjianRoster, setUjianMarkah, type UjianRosterRow } from '@/lib/perkaderan-program';

/** Masukkan markah satu ujian. Naqib: mad'u kumpulan sendiri; admin Lajnah/Super Admin: semua. Kosong = belum ada markah. */
export default function PerkaderanUjianScreen() {
  const goBack = useGoBack();
  const { id, program } = useLocalSearchParams<{ id?: string; program?: string }>();
  const [rows, setRows] = useState<UjianRosterRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [nama, setNama] = useState('');
  const [penuh, setPenuh] = useState(100);
  const [lulus, setLulus] = useState(50);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'positive' | 'negative'; message: string } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let active = true;
      setLoading(true);
      Promise.all([fetchUjianRoster(id), program ? fetchUjian(program) : Promise.resolve([])])
        .then(([list, ujian]) => {
          if (!active) return;
          setRows(list);
          setValues(Object.fromEntries(list.map((r) => [r.mad_u_id, r.markah == null ? '' : String(r.markah)])));
          const u = ujian.find((x) => x.id === id);
          if (u) {
            setNama(u.nama);
            setPenuh(u.markah_penuh);
            setLulus(u.markah_lulus);
          }
        })
        .catch((caught) => active && setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memuatkan senarai.') }))
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, [id, program]),
  );

  const groups = useMemo(() => {
    const map = new Map<string, UjianRosterRow[]>();
    for (const r of rows) {
      const key = r.sekolah + ' — ' + r.group_name;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()];
  }, [rows]);

  const save = async () => {
    if (!id) return;
    const markah: (number | null)[] = [];
    for (const r of rows) {
      const raw = (values[r.mad_u_id] ?? '').trim().replace(',', '.');
      if (raw === '') {
        markah.push(null);
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > penuh) {
        setBanner({ tone: 'negative', message: 'Markah ' + r.nama + ' mesti antara 0 dan ' + penuh + '.' });
        return;
      }
      markah.push(n);
    }
    setBusy(true);
    try {
      await setUjianMarkah(id, rows.map((r) => r.mad_u_id), markah);
      setBanner({ tone: 'positive', message: 'Markah disimpan.' });
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal menyimpan markah.') });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingScreen />;

  return (
    <Screen padTop={false}>
      <ScreenHeader title={nama || 'Markah Ujian'} onBackPress={goBack} />
      <View className="gap-4 px-gutter pb-10">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}
        <Text className="text-sm text-ink-muted">Markah penuh {penuh} · markah lulus {lulus}. Biarkan kosong jika belum ada markah.</Text>
        {rows.length === 0 ? (
          <EmptyState icon="people-outline" title="Tiada mad'u" description="Tiada mad'u aktif dalam kumpulan anda untuk program ini." />
        ) : (
          <>
            {groups.map(([title, list]) => (
              <View key={title} className="gap-2">
                <Text className="text-sm font-bold text-ink">{title}</Text>
                {list.map((r) => (
                  <TextField
                    key={r.mad_u_id}
                    label={r.nama + ' (' + r.tingkatan + ')'}
                    value={values[r.mad_u_id] ?? ''}
                    onChangeText={(v) => setValues((prev) => ({ ...prev, [r.mad_u_id]: v }))}
                    keyboardType="decimal-pad"
                    editable={!busy}
                  />
                ))}
              </View>
            ))}
            <Button label="Simpan Markah" loading={busy} disabled={busy} onPress={() => void save()} />
          </>
        )}
      </View>
    </Screen>
  );
}
