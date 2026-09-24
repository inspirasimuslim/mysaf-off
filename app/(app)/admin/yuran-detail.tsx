import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { Segmented } from '@/components/ui/segmented';
import { TextField } from '@/components/ui/text-field';
import { useYuranAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { useIsDesktop } from '@/lib/use-desktop';
import { addManualAdjustment, fetchYuranSummary, ringgit, type YuranSummary } from '@/lib/yuran';

type Banner = { tone: 'positive' | 'negative'; message: string } | null;

/** Pelarasan boleh menambah kredit atau menambah caj — dua arah, dua maksud. */
type Direction = 'bayaran' | 'caj';

const DIRECTION_OPTIONS = [
  { value: 'bayaran' as Direction, label: 'Bayaran' },
  { value: 'caj' as Direction, label: 'Caj' },
];

/**
 * Yuran seorang ahli, tahun demi tahun — modul BENDAHARI.
 *
 * Pelarasan ditulis sebagai baris BAHARU dalam `yuran_payments` dan tidak
 * pernah menyunting baris sedia ada. Itu yang menjadikan soalan "kenapa
 * bakinya berubah" mempunyai jawapan: setiap perubahan ialah satu catatan
 * dengan tarikh, jumlah dan nota.
 */
export default function YuranDetailScreen() {
  const params = useLocalSearchParams<{ id?: string; nama?: string; nombor?: string }>();
  const desktop = useIsDesktop();

  // Desktop: butiran hidup di panel kanan senarai — pautan terus dibuka di sana.
  if (desktop) {
    return <Redirect href={{ pathname: '/(app)/admin/yuran-list', params: params.id ? { id: params.id } : {} }} />;
  }

  return <YuranDetailView id={params.id} nama={params.nama} nombor={params.nombor} />;
}

/** Skrin penuh di mobile, panel kanan di desktop (`yuran-list`). `onChanged` selepas pelarasan direkod. */
export function YuranDetailView({
  id,
  nama,
  nombor,
  onChanged,
}: {
  id?: string;
  nama?: string;
  nombor?: string;
  onChanged?: () => void;
}) {
  const goBack = useGoBack();
  const { loading: accessLoading, canView, canEdit } = useYuranAccess();

  const memberId = id ?? null;
  const memberName = nama?.trim() || 'Ahli';

  const [summary, setSummary] = useState<YuranSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  // --- Borang pelarasan -----------------------------------------------------
  const [direction, setDirection] = useState<Direction>('bayaran');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!memberId) return;
    try {
      setSummary(await fetchYuranSummary(memberId));
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan rekod yuran.') });
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useFocusEffect(
    useCallback(() => {
      if (accessLoading || !canView) return;
      void load();
    }, [accessLoading, canView, load]),
  );

  const parsedYear = Number.parseInt(year, 10);
  const yearValid = Number.isFinite(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100;
  const parsedAmount = Number.parseFloat(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const ready = yearValid && amountValid;

  const submit = useCallback(async () => {
    if (!memberId || !ready || saving) return;

    setBanner(null);
    setSaving(true);
    try {
      /*
        Tanda ditentukan oleh arah yang dipilih dan bukan oleh apa yang ditaip.
        Membenarkan '-50' dalam medan amaun bermakna dua cara menyatakan perkara
        yang sama, dan satu daripadanya akan disalah taip.
      */
      await addManualAdjustment({
        memberId,
        year: parsedYear,
        amount: direction === 'bayaran' ? parsedAmount : -parsedAmount,
        note: note.trim() || null,
      });

      setAmount('');
      setNote('');
      setBanner({
        tone: 'positive',
        message:
          (direction === 'bayaran' ? 'Bayaran ' : 'Caj tambahan ') +
          ringgit(parsedAmount) +
          ' direkodkan untuk tahun ' +
          parsedYear +
          '.',
      });
      await load();
      onChanged?.();
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal merekod pelarasan.') });
    } finally {
      setSaving(false);
    }
  }, [direction, load, memberId, note, onChanged, parsedAmount, parsedYear, ready, saving]);

  if (accessLoading || loading) return <LoadingScreen />;

  if (!canView || !memberId) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Yuran Ahli" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title={canView ? 'Rekod tidak dijumpai' : 'Tiada akses'}
            description={
              canView
                ? 'Ahli ini tidak dapat dikenal pasti. Kembali ke senarai dan cuba lagi.'
                : 'Modul Yuran memerlukan kebenaran melihat pada department BENDAHARI.'
            }
          />
        </View>
      </Screen>
    );
  }

  const settled = summary === null || summary.tertunggak === 0;

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow={nombor ? 'Ahli ' + nombor : 'Panel Admin'}
        title={memberName}
        subtitle="Yuran keahlian"
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

        <Card tone={settled ? 'primary' : 'surface'}>
          <Text className={`text-sm ${settled ? 'text-white/70' : 'text-ink-muted'}`}>
            {settled ? 'Status' : 'Jumlah tertunggak'}
          </Text>
          {settled ? (
            <>
              <Text className="mt-2 text-stat font-bold text-white">Lunas</Text>
              {summary && summary.kredit > 0 ? (
                <Text className="mt-1 text-sm text-white/70">Kredit {ringgit(summary.kredit)}</Text>
              ) : null}
            </>
          ) : (
            <Text className="mt-2 text-stat-lg font-bold text-negative">
              {ringgit(summary?.tertunggak ?? 0)}
            </Text>
          )}
        </Card>

        <View>
          <SectionTitle title="Pecahan Tahun" />
          {!summary || summary.years.length === 0 ? (
            <EmptyState
              icon="document-text-outline"
              title="Tiada rekod"
              description="Ahli ini belum mempunyai baris yuran. Jana yuran tahunan atau import baki permulaan."
            />
          ) : (
            <View className="gap-2">
              {summary.years.map((row) => (
                <View key={row.year} className="rounded-field border border-line bg-surface p-4">
                  <View className="flex-row items-center gap-3">
                    <Text className="text-base font-bold text-ink">{row.year}</Text>
                    {row.is_opening_balance ? <Badge label="Baki permulaan" tone="info" /> : null}
                    <View className="flex-1" />
                    <Badge
                      label={row.baki > 0 ? ringgit(row.baki) : row.baki < 0 ? 'Kredit' : 'Lunas'}
                      tone={row.baki > 0 ? 'negative' : 'positive'}
                    />
                  </View>

                  <View className="mt-3 flex-row justify-between">
                    <Cell label="Dicaj" value={ringgit(row.amount_due)} />
                    <Cell label="Dibayar" value={ringgit(row.total_paid)} />
                    <Cell label="Baki" value={ringgit(Math.max(row.baki, 0))} />
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {canEdit ? (
          <View className="pb-8">
            <SectionTitle
              title="Tambah Pelarasan"
              caption="Setiap pelarasan ialah catatan baharu — rekod lama tidak pernah ditulis ganti."
            />
            <View className="gap-4">
              <Segmented
                label="Jenis"
                value={direction}
                options={DIRECTION_OPTIONS}
                onChange={setDirection}
                disabled={saving}
              />

              <TextField
                label="Tahun"
                value={year}
                onChangeText={(value) => setYear(value.replace(/[^\d]/g, '').slice(0, 4))}
                editable={!saving}
                keyboardType="number-pad"
                error={year.length > 0 && !yearValid ? 'Tahun antara 2000 dan 2100.' : null}
              />

              <TextField
                label={direction === 'bayaran' ? 'Amaun bayaran (RM)' : 'Amaun caj tambahan (RM)'}
                placeholder="30.00"
                value={amount}
                onChangeText={(value) => setAmount(value.replace(/[^\d.]/g, '').slice(0, 10))}
                editable={!saving}
                keyboardType="decimal-pad"
                error={amount.length > 0 && !amountValid ? 'Masukkan amaun lebih daripada sifar.' : null}
              />

              <TextField
                label="Nota (pilihan)"
                placeholder="Contoh: bayaran tunai 12/09"
                value={note}
                onChangeText={setNote}
                editable={!saving}
                autoCapitalize="sentences"
              />

              <Button
                label="Rekod Pelarasan"
                loading={saving}
                disabled={saving || !ready}
                onPress={() => void submit()}
              />
            </View>
          </View>
        ) : (
          <View className="pb-8">
            <Notice tone="info" message="Anda hanya mempunyai akses Lihat. Rekod di atas adalah paparan sahaja." />
          </View>
        )}
      </View>
    </Screen>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-xs text-ink-muted">{label}</Text>
      <Text className="mt-0.5 text-sm font-semibold text-ink">{value}</Text>
    </View>
  );
}
