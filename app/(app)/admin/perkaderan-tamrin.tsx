import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { toMalayErrorVerbose } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { fetchTamrinRoster, setTamrinAttendance, type TamrinRosterRow } from '@/lib/perkaderan-program';
import { useColors } from '@/lib/theme';

/**
 * Rekod kehadiran satu tamrin. Naqib melihat mad'u kumpulan SENDIRI; admin Lajnah/Super Admin
 * melihat semua mad'u program. Disimpan sekali gus (senarai yang dipapar sahaja disentuh).
 */
export default function PerkaderanTamrinScreen() {
  const goBack = useGoBack();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [rows, setRows] = useState<TamrinRosterRow[]>([]);
  const [hadir, setHadir] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'positive' | 'negative'; message: string } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let active = true;
      setLoading(true);
      fetchTamrinRoster(id)
        .then((list) => {
          if (!active) return;
          setRows(list);
          setHadir(new Set(list.filter((r) => r.hadir).map((r) => r.mad_u_id)));
        })
        .catch((caught) => active && setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memuatkan senarai.') }))
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, [id]),
  );

  const toggle = (madUId: string) =>
    setHadir((prev) => {
      const next = new Set(prev);
      if (next.has(madUId)) next.delete(madUId);
      else next.add(madUId);
      return next;
    });

  const groups = useMemo(() => {
    const map = new Map<string, TamrinRosterRow[]>();
    for (const r of rows) {
      const key = r.sekolah + ' — ' + r.group_name;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()];
  }, [rows]);

  const save = async () => {
    if (!id) return;
    setBusy(true);
    try {
      await setTamrinAttendance(id, rows.map((r) => r.mad_u_id), [...hadir]);
      setBanner({ tone: 'positive', message: 'Kehadiran disimpan (' + hadir.size + ' hadir).' });
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal menyimpan kehadiran.') });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingScreen />;

  return (
    <Screen padTop={false}>
      <ScreenHeader title="Kehadiran Tamrin" onBackPress={goBack} />
      <View className="gap-4 px-gutter pb-10">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}
        {rows.length === 0 ? (
          <EmptyState icon="people-outline" title="Tiada mad'u" description="Tiada mad'u aktif dalam kumpulan anda untuk program ini." />
        ) : (
          <>
            {groups.map(([title, list]) => (
              <View key={title} className="gap-2">
                <Text className="text-sm font-bold text-ink">{title}</Text>
                {list.map((r) => {
                  const on = hadir.has(r.mad_u_id);
                  return (
                    <Pressable
                      key={r.mad_u_id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      onPress={() => toggle(r.mad_u_id)}
                      className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-card">
                      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? colors.primary : colors.inkMuted} />
                      <View className="flex-1">
                        <Text className="text-base text-ink">{r.nama}</Text>
                        <Text className="text-xs text-ink-muted">{r.tingkatan}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <Text className="text-xs text-ink-muted">{hadir.size} daripada {rows.length} hadir</Text>
            <Button label="Simpan Kehadiran" loading={busy} disabled={busy} onPress={() => void save()} />
          </>
        )}
      </View>
    </Screen>
  );
}
