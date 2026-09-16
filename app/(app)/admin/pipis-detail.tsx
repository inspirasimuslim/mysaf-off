import { useFocusEffect, useLocalSearchParams } from 'expo-router';
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
import { usePipisAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import {
  addPipisAdjustment,
  displayAmount,
  fetchPipisHistory,
  fetchPipisSummary,
  methodLabel,
  paymentStatusLabel,
  peratusLabel,
  ringgitPipis,
  type PipisContribution,
  type PipisSummary,
} from '@/lib/pipis';

type Banner = { tone: 'positive' | 'negative'; message: string } | null;

/** Pelarasan boleh menambah sumbangan atau menolaknya — dua arah, dua maksud. */
type Direction = 'sumbangan' | 'potongan';

const DIRECTION_OPTIONS = [
  { value: 'sumbangan' as Direction, label: 'Sumbangan (+)' },
  { value: 'potongan' as Direction, label: 'Potongan (−)' },
];

/**
 * Sumbangan PIPIS seorang ahli — modul LAJNAH EKONOMI DAN ASET.
 *
 * Pelarasan ditulis sebagai baris BAHARU dan tidak pernah menyunting baris
 * sedia ada. Itu yang menjadikan soalan "kenapa jumlahnya berubah" mempunyai
 * jawapan: setiap perubahan ialah satu catatan dengan tarikh, jumlah dan nota.
 */
export default function PipisDetailScreen() {
  const goBack = useGoBack();
  const params = useLocalSearchParams<{ id?: string; nama?: string; nombor?: string }>();
  const { loading: accessLoading, canView, canEdit } = usePipisAccess();

  const memberId = params.id ?? null;
  const memberName = params.nama?.trim() || 'Ahli';

  const [summary, setSummary] = useState<PipisSummary | null>(null);
  const [history, setHistory] = useState<PipisContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  // --- Borang pelarasan -----------------------------------------------------
  const [direction, setDirection] = useState<Direction>('sumbangan');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!memberId) return;
    try {
      const [nextSummary, nextHistory] = await Promise.all([
        fetchPipisSummary(memberId),
        fetchPipisHistory(memberId),
      ]);
      setSummary(nextSummary);
      setHistory(nextHistory);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan rekod sumbangan.') });
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

  const parsedAmount = Number.parseFloat(amount);
  const ready = Number.isFinite(parsedAmount) && parsedAmount > 0;

  const submit = useCallback(async () => {
    if (!memberId || !ready || saving) return;

    setBanner(null);
    setSaving(true);
    try {
      /*
        Tanda ditentukan oleh arah yang dipilih dan bukan oleh apa yang ditaip —
        bentuk yang sama seperti borang pelarasan yuran. Membenarkan '-50' dalam
        medan amaun bermakna dua cara menyatakan perkara yang sama, dan salah
        satu daripadanya akan disalah taip.
      */
      await addPipisAdjustment({
        memberId,
        amount: direction === 'sumbangan' ? parsedAmount : -parsedAmount,
        note: note.trim() || null,
      });

      setAmount('');
      setNote('');
      setBanner({
        tone: 'positive',
        message:
          (direction === 'sumbangan' ? 'Sumbangan ' : 'Potongan ') +
          ringgitPipis(parsedAmount) +
          ' direkodkan.',
      });
      await load();
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal merekod pelarasan.') });
    } finally {
      setSaving(false);
    }
  }, [direction, load, memberId, note, parsedAmount, ready, saving]);

  if (accessLoading || loading) return <LoadingScreen />;

  if (!canView || !memberId) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="PIPIS Ahli" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title={canView ? 'Rekod tidak dijumpai' : 'Tiada akses'}
            description={
              canView
                ? 'Ahli ini tidak dapat dikenal pasti. Kembali ke senarai dan cuba lagi.'
                : 'Modul PIPIS ASET memerlukan kebenaran melihat pada department LAJNAH EKONOMI DAN ASET.'
            }
          />
        </View>
      </Screen>
    );
  }

  const reached = summary !== null && summary.jumlah >= summary.sasaran;

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow={params.nombor ? 'Ahli ' + params.nombor : 'Panel Admin'}
        title={memberName}
        subtitle="Sumbangan PIPIS ASET"
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

        <Card tone={reached ? 'primary' : 'surface'}>
          <Text className={`text-sm ${reached ? 'text-white/70' : 'text-ink-muted'}`}>Jumlah sumbangan</Text>
          <Text className={`mt-2 text-stat-lg font-bold ${reached ? 'text-white' : 'text-warn'}`}>
            {ringgitPipis(summary?.jumlah ?? 0)}
          </Text>
          <Text className={`mt-1 text-sm ${reached ? 'text-white/70' : 'text-ink-muted'}`}>
            {peratusLabel(summary?.peratus ?? 0) + ' daripada RM5,000 · ' + (summary?.status ?? 'Belum Cukup')}
          </Text>
        </Card>

        <View>
          <SectionTitle title={'Sejarah (' + history.length + ')'} caption="Terbaharu dahulu." />
          {history.length === 0 ? (
            <EmptyState
              icon="document-text-outline"
              title="Tiada rekod"
              description="Ahli ini belum mempunyai rekod sumbangan. Import fail atau tambah pelarasan di bawah."
            />
          ) : (
            <View className="gap-2">
              {history.map((row) => (
                <View key={row.id} className="rounded-field border border-line bg-surface p-4">
                  <View className="flex-row items-center gap-3">
                    <Text
                      className={`text-base font-bold ${
                        row.status !== 'success' ? 'text-ink-muted' : row.amount < 0 ? 'text-negative' : 'text-ink'
                      }`}>
                      {ringgitPipis(displayAmount(row))}
                    </Text>
                    <View className="flex-1" />
                    {row.method === 'gateway' ? (
                      <Badge
                        label={paymentStatusLabel(row.status)}
                        tone={row.status === 'success' ? 'positive' : row.status === 'failed' ? 'negative' : 'warn'}
                      />
                    ) : null}
                    <Badge
                      label={methodLabel(row.method)}
                      tone={row.method === 'import' ? 'info' : 'warn'}
                    />
                  </View>
                  <Text className="mt-2 text-xs text-ink-muted">
                    {new Date(row.created_at).toLocaleDateString('ms-MY')}
                    {row.note ? ' · ' + row.note : ''}
                  </Text>
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
                label={direction === 'sumbangan' ? 'Amaun sumbangan (RM)' : 'Amaun potongan (RM)'}
                placeholder="500.00"
                value={amount}
                onChangeText={(value) => setAmount(value.replace(/[^\d.]/g, '').slice(0, 10))}
                editable={!saving}
                keyboardType="decimal-pad"
                error={amount.length > 0 && !ready ? 'Masukkan amaun lebih daripada sifar.' : null}
              />

              <TextField
                label="Nota (pilihan)"
                placeholder="Contoh: sumbangan tunai 12/09"
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
