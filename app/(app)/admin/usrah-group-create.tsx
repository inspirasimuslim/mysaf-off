import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { MemberPickerField } from '@/components/ui/member-picker-field';
import { Notice } from '@/components/ui/notice';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { toMalayErrorVerbose } from '@/lib/errors';
import { fetchMembersForPicker } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import { createGroupWithMadU } from '@/lib/perkaderan';
import { SEKOLAH_OPTIONS, TINGKATAN_OPTIONS, type MemberPickerRow } from '@/types/database';

type PendingMadU = { nama: string; tingkatan: string | null };

/**
 * Cipta kumpulan usrah sekolah — TIADA sesi dicipta di sini. Sesi pertama
 * dicipta kemudian melalui Hub: "Kumpulan Sedia Ada" -> "Tambah Sesi
 * Baharu", sama seperti sesi kedua dan seterusnya (satu laluan sahaja untuk
 * mencipta sesi, tidak dua bentuk berbeza).
 */
export default function UsrahGroupCreateScreen() {
  const router = useRouter();
  const goBack = useGoBack();

  const [sekolah, setSekolah] = useState<string | null>(null);
  const [partnerNaqibId, setPartnerNaqibId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [candidates, setCandidates] = useState<MemberPickerRow[]>([]);
  useEffect(() => {
    let active = true;
    fetchMembersForPicker()
      .then((rows) => active && setCandidates(rows))
      .catch(() => active && setCandidates([]));
    return () => {
      active = false;
    };
  }, []);

  // --- Senarai mad'u dibina sebelum submit -------------------------------
  const [pendingMadU, setPendingMadU] = useState<PendingMadU[]>([]);
  const [draftNama, setDraftNama] = useState('');
  const [draftTingkatan, setDraftTingkatan] = useState<string | null>(null);

  const addDraftMadU = useCallback(() => {
    if (!draftNama.trim()) return;
    setPendingMadU((current) => [...current, { nama: draftNama.trim(), tingkatan: draftTingkatan }]);
    setDraftNama('');
    setDraftTingkatan(null);
  }, [draftNama, draftTingkatan]);

  const removeDraftMadU = useCallback((index: number) => {
    setPendingMadU((current) => current.filter((_, i) => i !== index));
  }, []);

  const submit = useCallback(async () => {
    if (!sekolah || busy) return;

    setError(null);
    setBusy(true);
    try {
      const group = await createGroupWithMadU(sekolah, partnerNaqibId, pendingMadU);
      // `created=1`: skrin butiran memapar notis "Kumpulan berjaya dicipta." — banner
      // di skrin INI tidak berguna kerana `router.replace` menutupnya serta-merta.
      router.replace({ pathname: '/(app)/admin/perkaderan-group-detail', params: { id: group.id, created: '1' } });
    } catch (caught) {
      setError(toMalayErrorVerbose(caught, 'Gagal mencipta kumpulan usrah.'));
    } finally {
      setBusy(false);
    }
  }, [busy, partnerNaqibId, pendingMadU, router, sekolah]);

  return (
    <Screen padTop={false}>
      <ScreenHeader eyebrow="Panel Naqib" title="Cipta Kumpulan Usrah" subtitle="Pilih sekolah dan tambah mad'u" onBackPress={goBack} />

      <View className="gap-6 px-gutter pt-6">
        {error ? <Notice tone="negative" message={error} /> : null}

        <View>
          <SectionTitle title="Sekolah" caption="Kumpulan usrah anda dinamakan automatik mengikut sekolah ini." />
          <PickerField label="Sekolah" value={sekolah} options={SEKOLAH_OPTIONS} onChange={setSekolah} clearable={false} disabled={busy} />
        </View>

        <View>
          <SectionTitle
            title="Partner Naqib (jika ada)"
            caption="Cadangan ini pra-isi setiap borang sesi baharu — setiap sesi masih boleh menukarnya sendiri."
          />
          <MemberPickerField
            label="Partner Naqib"
            value={partnerNaqibId}
            candidates={candidates}
            onChange={setPartnerNaqibId}
            placeholder="Tiada partner"
            disabled={busy}
          />
        </View>

        <View className="pb-8">
          <SectionTitle title={"Mad'u (" + pendingMadU.length + ')'} caption="Tambah beberapa mad'u sebelum cipta kumpulan, atau tambah kemudian." />

          <View className="gap-3 rounded-card border border-line bg-surface p-card">
            <TextField label="Nama" value={draftNama} onChangeText={setDraftNama} editable={!busy} autoCapitalize="words" />
            <PickerField label="Tingkatan" value={draftTingkatan} options={TINGKATAN_OPTIONS} onChange={setDraftTingkatan} disabled={busy} />
            <Button label="+ Tambah ke Senarai" variant="secondary" disabled={busy || !draftNama.trim()} onPress={addDraftMadU} />
          </View>

          {pendingMadU.length > 0 ? (
            <View className="mt-3 gap-2">
              {pendingMadU.map((mu, index) => (
                <View key={index} className="flex-row items-center gap-3 rounded-field border border-line bg-surface px-3 py-2.5">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-ink">{mu.nama}</Text>
                    {mu.tingkatan ? <Text className="text-xs text-ink-muted">{mu.tingkatan}</Text> : null}
                  </View>
                  <IconButton
                    icon="close-outline"
                    tone="danger"
                    accessibilityLabel={'Buang ' + mu.nama + ' daripada senarai'}
                    disabled={busy}
                    onPress={() => removeDraftMadU(index)}
                  />
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View className="pb-8">
          <Button label="Cipta Kumpulan" loading={busy} disabled={busy || !sekolah} onPress={() => void submit()} />
        </View>
      </View>
    </Screen>
  );
}
