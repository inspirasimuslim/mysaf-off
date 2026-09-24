import { useState } from 'react';
import { View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { FEEDBACK_MAX_LENGTH, submitAppFeedback } from '@/lib/app-feedback';
import { useAuth } from '@/lib/auth-context';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { fetchMyMemberLinked } from '@/lib/members';

type Banner = { tone: 'positive' | 'negative'; message: string } | null;

/**
 * Borang hantar sahaja. Ahli tidak melihat semula apa yang dihantar — hanya
 * Super Admin membaca (lihat `admin/app-feedback.tsx`).
 */
export default function MaklumBalasScreen() {
  const goBack = useGoBack();
  const { user } = useAuth();

  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

  const send = async () => {
    const text = message.trim();
    if (!text || busy) return;

    setBusy(true);
    setBanner(null);
    try {
      const member = user?.id ? await fetchMyMemberLinked(user.id) : null;
      if (!member) {
        setBanner({ tone: 'negative', message: 'Akaun anda belum dipautkan kepada rekod ahli.' });
        return;
      }
      await submitAppFeedback(member.id, text);
      setMessage('');
      setBanner({ tone: 'positive', message: 'Terima kasih! Maklum balas anda telah dihantar.' });
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menghantar maklum balas.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen padTop={false}>
      <ScreenHeader eyebrow="Tetapan" title="Maklum Balas" onBackPress={goBack} />

      <View className="gap-4 px-gutter pb-8 pt-6">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

        <TextField
          label="Maklum balas anda"
          placeholder="Nyatakan apa-apa maklum balas atau penambahbaikan mengenai aplikasi MySAFF."
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={FEEDBACK_MAX_LENGTH}
          editable={!busy}
        />
        <Button
          label="Hantar"
          loading={busy}
          disabled={busy || !message.trim()}
          onPress={() => void send()}
        />
      </View>
    </Screen>
  );
}
