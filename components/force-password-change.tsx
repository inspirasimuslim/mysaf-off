import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Colors } from '@/constants/theme';
import { toMalayError } from '@/lib/errors';
import { signOutEverywhere } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { completePasswordChange } from '@/lib/temp-password';

/**
 * Tukar kata laluan sementara — satu-satunya skrin yang boleh dicapai sehingga
 * ia selesai.
 *
 * Sebuah KOMPONEN dan bukan laluan, dengan sengaja. `app/(app)/_layout.tsx`
 * memaparkannya MENGGANTIKAN keseluruhan `<Tabs>`, jadi bar tab dan setiap skrin
 * di bawahnya tidak pernah wujud dalam pokok komponen — bukan sekadar tidak
 * boleh dicapai. Sebuah laluan dengan pengalihan boleh dilangkau oleh pautan
 * dalam atau butang kembali; ini tidak boleh.
 *
 * Kata laluan sementara diketahui umum, jadi seseorang yang boleh melangkau
 * skrin ini akan terus menggunakannya.
 *
 * Satu-satunya jalan keluar selain menetapkan kata laluan baharu ialah log
 * keluar, dan butang itu ada di bawah — jalan buntu tanpa pintu ialah pepijat,
 * bukan keselamatan.
 */

const MIN_PASSWORD_LENGTH = 8;

export function ForcePasswordChange({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    if (busy) return;

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError('Kata laluan mesti sekurang-kurangnya ' + MIN_PASSWORD_LENGTH + ' aksara.');
      return;
    }
    if (password !== confirm) {
      setError('Pengesahan kata laluan tidak sepadan.');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(toMalayError(updateError, 'Gagal menukar kata laluan. Sila cuba lagi.'));
        return;
      }

      /*
        Tanda dibuang SELEPAS kata laluan benar-benar bertukar, bukan sebelumnya.
        Susunan terbalik akan melepaskan seseorang masuk sambil kata laluannya
        masih 'ikhwandihati' apabila panggilan Auth gagal.

        Kegagalan di sini pula dilaporkan dan TIDAK melepaskan pengguna masuk:
        kata laluan sudah bertukar, jadi mencuba semula selamat — dan pintu
        kekal tertutup sehingga pangkalan data mengesahkannya.
      */
      await completePasswordChange();
      onDone();
    } catch (caught) {
      setError(
        toMalayError(caught, 'Kata laluan telah ditukar, tetapi pengesahan gagal. Sila cuba lagi.'),
      );
    } finally {
      setBusy(false);
    }
  }, [busy, confirm, onDone, password]);

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View className="gap-6 px-gutter pt-6">
          <View className="items-center pb-2 pt-6">
            <View className="h-20 w-20 items-center justify-center rounded-[24px] bg-primary">
              <Ionicons name="key" size={34} color={Colors.white} />
            </View>
            <Text className="mt-5 text-2xl font-bold text-ink">Tetapkan Kata Laluan</Text>
            <Text className="mt-1.5 px-4 text-center text-sm leading-5 text-ink-muted">
              Akaun anda masih menggunakan kata laluan sementara yang dikongsi. Tetapkan kata laluan anda
              sendiri untuk meneruskan.
            </Text>
          </View>

          <Card>
            <View className="gap-5">
              <TextField
                label="Kata laluan baharu"
                placeholder={'Minimum ' + MIN_PASSWORD_LENGTH + ' aksara'}
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                secure
              />

              <TextField
                label="Sahkan kata laluan"
                placeholder="Masukkan semula kata laluan"
                value={confirm}
                onChangeText={setConfirm}
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
                secure
              />

              {error ? <Notice tone="negative" message={error} /> : null}

              <Button label="Simpan & Teruskan" loading={busy} disabled={busy} onPress={() => void submit()} />
            </View>
          </Card>

          <Button label="Log Keluar" variant="ghost" disabled={busy} onPress={() => void signOutEverywhere()} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
