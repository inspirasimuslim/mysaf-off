import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { DateTimeField } from '@/components/ui/date-time-field';
import { MemberPickerField } from '@/components/ui/member-picker-field';
import { Notice } from '@/components/ui/notice';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { toMalayErrorVerbose } from '@/lib/errors';
import { fetchMembersForPicker } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import { createGroupWithFirstSession } from '@/lib/perkaderan';
import { SEKOLAH_OPTIONS, type MemberPickerRow } from '@/types/database';

function today(): string {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
}

/**
 * Cipta kumpulan usrah sekolah + sesi PERTAMA serentak dalam SATU aliran —
 * dipapar bila naqib belum mempunyai kumpulan langsung. Mad'u ditambah
 * KEMUDIAN di skrin kumpulan; sesi pertama ini sengaja tercipta tanpa
 * sebarang kehadiran.
 */
export default function UsrahGroupCreateScreen() {
  const router = useRouter();
  const goBack = useGoBack();

  const [sekolah, setSekolah] = useState<string | null>(null);
  const [sessionDate, setSessionDate] = useState(today());
  const [locationText, setLocationText] = useState('');
  const [topik, setTopik] = useState('');
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

  const submit = useCallback(async () => {
    if (!sekolah || busy) return;

    setError(null);
    setBusy(true);
    try {
      const { group } = await createGroupWithFirstSession(sekolah, partnerNaqibId, {
        session_date: sessionDate,
        location_text: locationText.trim() || null,
        topik: topik.trim() || null,
      });
      router.replace({ pathname: '/(app)/admin/perkaderan-group-detail', params: { id: group.id } });
    } catch (caught) {
      setError(toMalayErrorVerbose(caught, 'Gagal mencipta kumpulan usrah.'));
    } finally {
      setBusy(false);
    }
  }, [busy, locationText, partnerNaqibId, router, sekolah, sessionDate, topik]);

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Naqib"
        title="Cipta Kumpulan Usrah"
        subtitle="Pilih sekolah dan key in sesi pertama"
        onBackPress={goBack}
      />

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
          <SectionTitle title="Sesi Pertama" caption="Mad'u ditambah selepas kumpulan tercipta." />
          <View className="gap-3">
            <DateTimeField label="Tarikh sesi" mode="date" value={sessionDate} onChange={setSessionDate} disabled={busy} />
            <TextField label="Lokasi" value={locationText} onChangeText={setLocationText} editable={!busy} autoCapitalize="sentences" />
            <TextField label="Topik" value={topik} onChangeText={setTopik} editable={!busy} autoCapitalize="sentences" />
          </View>
        </View>

        <View className="pb-8">
          <Button label="Cipta Kumpulan & Sesi Pertama" loading={busy} disabled={busy || !sekolah} onPress={() => void submit()} />
        </View>
      </View>
    </Screen>
  );
}
