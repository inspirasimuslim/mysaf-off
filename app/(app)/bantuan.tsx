import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { useAuth } from '@/lib/auth-context';
import {
  KATEGORI_LABEL,
  KATEGORI_PENERANGAN,
  STATUS_LABEL,
  STATUS_TONE,
  bantuanError,
  fetchMyBantuan,
  formatRM,
  formatTarikh,
  optionLabels,
  SEBAB_OPTIONS,
  type BantuanApplication,
} from '@/lib/bantuan';
import { fetchMyMemberLinked } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';

/**
 * Senarai Permohonan Zakat milik sendiri (migration 148). Status memakai teks
 * bersama warna. Nombor rujukan hanya ada selepas penghantaran pertama.
 * Permohonan baharu dipilih mengikut borang: Belajar atau Bekerja/Berkahwin.
 */
export default function BantuanScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { user } = useAuth();
  const userId = user?.id;

  const [rows, setRows] = useState<BantuanApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let active = true;
      void (async () => {
        try {
          const member = await fetchMyMemberLinked(userId);
          if (!member) {
            if (active) {
              setRows([]);
              setError('Akaun anda belum dipautkan kepada rekod ahli.');
            }
            return;
          }
          const data = await fetchMyBantuan(member.id);
          if (active) {
            setRows(data);
            setError(null);
          }
        } catch (caught) {
          if (active) {
            setRows((prev) => prev ?? []);
            setError(bantuanError(caught, 'Gagal memuatkan permohonan.'));
          }
        }
      })();
      return () => {
        active = false;
      };
    }, [userId]),
  );

  if (rows === null) return <LoadingScreen />;

  return (
    <Screen padTop={false}>
      <ScreenHeader eyebrow="Tabung Zakat" title="Permohonan Zakat" onBackPress={goBack} />

      <View className="gap-4 px-gutter pb-10 pt-5">
        <Card>
          <Text className="text-sm leading-5 text-ink-muted">
            Bantuan zakat diberikan sekali sahaja (one-off) berdasarkan keperluan yang dinilai dan kemampuan organisasi. Permohonan dibuka setiap bulan dan boleh dihantar lebih daripada sekali pada bulan-bulan berikutnya. Permohonan tidak menjamin kelulusan, dan kelulusan tidak bermaksud wang telah dibayar.
          </Text>
        </Card>

        {(['belajar', 'bekerja'] as const).map((kategori) => (
          <Pressable
            key={kategori}
            accessibilityRole="button"
            accessibilityLabel={'Permohonan baharu: ' + KATEGORI_LABEL[kategori]}
            onPress={() => router.push({ pathname: '/(app)/bantuan-borang', params: { kategori } })}
            className="active:opacity-70">
            <Card>
              <View className="gap-1">
                <Text className="text-base font-bold text-primary">Permohonan Baharu — {KATEGORI_LABEL[kategori]}</Text>
                <Text className="text-sm text-ink-muted">{KATEGORI_PENERANGAN[kategori]}</Text>
              </View>
            </Card>
          </Pressable>
        ))}

        {error ? <Notice tone="negative" message={error} /> : null}

        {rows.length === 0 && !error ? (
          <EmptyState icon="hand-left-outline" title="Belum ada permohonan" description="Permohonan yang anda buat akan dipaparkan di sini bersama statusnya." />
        ) : null}

        {rows.map((row) => {
          const editable = row.status === 'draft' || row.status === 'needs_information';
          return (
            <Pressable
              key={row.id}
              accessibilityRole="button"
              accessibilityLabel={'Permohonan ' + (row.no_rujukan ?? 'draf') + ', ' + STATUS_LABEL[row.status]}
              onPress={() =>
                row.status === 'draft'
                  ? router.push({ pathname: '/(app)/bantuan-borang', params: { id: row.id } })
                  : router.push({ pathname: '/(app)/bantuan-info', params: { id: row.id } })
              }
              className="active:opacity-70">
              <Card>
                <View className="gap-2">
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="text-base font-bold text-ink">{row.no_rujukan ?? 'Draf (belum dihantar)'}</Text>
                    <Badge label={STATUS_LABEL[row.status]} tone={STATUS_TONE[row.status]} />
                  </View>
                  <Text className="text-sm text-ink">{KATEGORI_LABEL[row.kategori]}</Text>
                  <Text className="text-sm text-ink-muted">{optionLabels(SEBAB_OPTIONS, row.sebab_keperluan, row.sebab_lain)}</Text>
                  <Text className="text-xs text-ink-muted">
                    {row.dihantar_at ? 'Dihantar ' + formatTarikh(row.dihantar_at) : 'Dikemas kini ' + formatTarikh(row.updated_at)}
                  </Text>
                  {row.status === 'approved' ? (
                    <Text className="text-xs font-semibold text-positive">Diluluskan {formatRM(row.jumlah_diluluskan)}</Text>
                  ) : null}
                  {editable && row.status === 'needs_information' ? (
                    <Text className="text-xs font-semibold text-warn">Perlu tindakan anda</Text>
                  ) : null}
                </View>
              </Card>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}
