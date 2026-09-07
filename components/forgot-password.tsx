import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { TextField } from '@/components/ui/text-field';
import { supabase } from '@/lib/supabase';

/**
 * Minta pautan tetapan semula kata laluan melalui emel.
 *
 * Jawapannya SENTIASA sama sama ada emel itu wujud atau tidak. Mesej yang
 * berbeza untuk emel yang tidak dikenali menjadikan skrin ini alat untuk
 * menyenaraikan siapa ahli organisasi ini — sesiapa boleh mencuba emel demi
 * emel dan membaca perbezaannya. Kerana itu ralat daripada Supabase juga tidak
 * dipapar melainkan ia jelas bukan tentang emel itu.
 *
 * Laluan ini memerlukan ahli MEMEGANG emel akaunnya. Yang tidak boleh
 * mengaksesnya perlu melalui Super Admin — sebab itu `ContactAdminLink` duduk
 * bersebelahan dengannya di skrin log masuk.
 */

const MAX_SHEET_WIDTH = 560;

const CONFIRMATION =
  'Jika emel itu wujud dalam sistem, pautan tetapan semula kata laluan telah dihantar. Semak peti masuk dan folder spam anda.';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
  visible: boolean;
  /** Emel yang sudah ditaip pada borang log masuk, supaya ia tidak perlu ditaip semula. */
  initialEmail?: string;
  onClose: () => void;
};

export function ForgotPasswordSheet({ visible, initialEmail = '', onClose }: Props) {
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  // Helaian dibuka semula dengan emel yang mungkin sudah berubah di borang
  // belakangnya; keadaan lama tidak boleh melekat.
  useEffect(() => {
    if (!visible) return;
    setEmail(initialEmail);
    setError(null);
    setSent(false);
  }, [initialEmail, visible]);

  const submit = async () => {
    if (busy) return;

    const value = email.trim();
    if (!EMAIL_PATTERN.test(value)) {
      setError('Masukkan alamat emel yang sah.');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      /*
        `createURL` menjana pautan yang betul bagi setiap platform tanpa
        menulis skema secara manual: 'mysafoff://reset-password' pada peranti,
        dan alamat pelayan pembangunan di web.
      */
      await supabase.auth.resetPasswordForEmail(value, {
        redirectTo: Linking.createURL('/reset-password'),
      });
    } catch {
      // Sengaja diabaikan — lihat nota di kepala fail.
    } finally {
      /*
        Keadaan "berjaya" ditetapkan tanpa mengira hasilnya. Kegagalan yang
        dipapar di sini akan membezakan emel yang wujud daripada yang tidak,
        yang merupakan perkara yang skrin ini cuba elakkan.
      */
      setBusy(false);
      setSent(true);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View
          className="w-full self-center rounded-t-card bg-surface px-gutter pt-6"
          style={{ maxWidth: MAX_SHEET_WIDTH, paddingBottom: insets.bottom + 20 }}>
          <Text className="text-lg font-bold text-ink">Lupa Kata Laluan</Text>
          <Text className="mt-1 text-sm leading-5 text-ink-muted">
            Masukkan emel akaun anda. Kami akan menghantar pautan untuk menetapkan kata laluan baharu.
          </Text>

          <View className="mt-5 gap-4">
            {sent ? (
              <Notice tone="positive" message={CONFIRMATION} />
            ) : (
              <>
                <TextField
                  label="Emel"
                  placeholder="nama@contoh.com"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  editable={!busy}
                  returnKeyType="go"
                  onSubmitEditing={() => void submit()}
                  error={error}
                />

                <Button
                  label="Hantar Pautan Reset"
                  loading={busy}
                  disabled={busy}
                  onPress={() => void submit()}
                />
              </>
            )}

            <Button label={sent ? 'Tutup' : 'Batal'} variant="secondary" onPress={onClose} />
          </View>

          {!sent ? (
            <Text className="mt-4 text-center text-xs leading-5 text-ink-muted">
              Tidak boleh mengakses emel ini? Hubungi Super Admin untuk tetapan semula secara manual.
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
