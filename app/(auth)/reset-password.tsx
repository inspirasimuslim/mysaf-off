import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Colors } from '@/constants/theme';
import { toMalayError } from '@/lib/errors';
import { signOutFromDevice } from '@/lib/session';
import { setAuthNotice } from '@/lib/suspension';
import { supabase } from '@/lib/supabase';

/**
 * Tetapkan kata laluan baharu daripada pautan emel.
 *
 * Pautan itu membawa bukti bahawa pemiliknya benar-benar memegang emel akaun
 * tersebut, dan Supabase menukarnya menjadi SESI. Jadi skrin ini berjalan
 * dengan pengguna yang sudah log masuk, walaupun ia berada dalam kumpulan
 * `(auth)` — `(auth)/_layout.tsx` mengecualikan laluan ini daripada
 * pengalihannya atas sebab itu.
 *
 * Tiga bentuk pautan dikendalikan kerana bentuknya ditentukan oleh templat
 * emel projek Supabase, bukan oleh app:
 *
 *   ?code=…                    aliran PKCE (tetapan semasa klien)
 *   ?token_hash=…&type=recovery  pautan pengesahan Supabase yang lazim
 *   #access_token=…&refresh_token=…  aliran implicit
 *
 * Menyokong satu sahaja bermakna menukar templat emel akan mematikan skrin ini
 * tanpa amaran.
 */

const MIN_PASSWORD_LENGTH = 8;

type Phase =
  | { step: 'menyemak' }
  | { step: 'sedia' }
  | { step: 'tidak-sah'; message: string };

/** Parameter dalam fragment '#a=1&b=2'. */
function parseFragment(url: string): Record<string, string> {
  const hash = url.indexOf('#');
  if (hash < 0) return {};

  const out: Record<string, string> = {};
  for (const pair of url.slice(hash + 1).split('&')) {
    const equals = pair.indexOf('=');
    if (equals <= 0) continue;
    out[decodeURIComponent(pair.slice(0, equals))] = decodeURIComponent(pair.slice(equals + 1));
  }
  return out;
}

function firstString(value: string | string[] | undefined | null): string | null {
  if (typeof value === 'string' && value) return value;
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0]) return value[0];
  return null;
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const url = Linking.useURL();

  const [phase, setPhase] = useState<Phase>({ step: 'menyemak' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      /*
        Sesi yang sudah wujud diterima tanpa memeriksa URL lagi. Di web,
        `detectSessionInUrl` sudah menukar token sebelum skrin ini dipasang,
        dan URLnya sudah dibersihkan — memaksa penukaran kedua akan gagal
        terhadap kod yang sudah digunakan.
      */
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        if (active) setPhase({ step: 'sedia' });
        return;
      }

      if (!url) return;

      const parsed = Linking.parse(url);
      const query = parsed.queryParams ?? {};
      const fragment = parseFragment(url);

      const code = firstString(query.code as string | string[]) ?? fragment.code ?? null;
      const tokenHash =
        firstString(query.token_hash as string | string[]) ?? fragment.token_hash ?? null;
      const accessToken = fragment.access_token ?? null;
      const refreshToken = fragment.refresh_token ?? null;

      try {
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else if (tokenHash) {
          const { error: otpError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          });
          if (otpError) throw otpError;
        } else if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
        } else {
          if (active) {
            setPhase({
              step: 'tidak-sah',
              message:
                'Pautan ini tidak lengkap. Buka pautan terus daripada emel yang dihantar, tanpa menyalin sebahagiannya.',
            });
          }
          return;
        }

        if (active) setPhase({ step: 'sedia' });
      } catch (caught) {
        if (active) {
          setPhase({
            step: 'tidak-sah',
            message: toMalayError(
              caught,
              'Pautan ini sudah luput atau telah digunakan. Mohon pautan baharu dari skrin log masuk.',
            ),
          });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [url]);

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
        Sesi pemulihan ditamatkan selepas kata laluan bertukar, dan pengguna
        dihantar semula ke skrin log masuk untuk masuk dengan kata laluan
        BAHARUnya.

        Membiarkan sesi itu hidup akan membawanya terus ke Dashboard — dan dia
        tidak pernah menaip kata laluan barunya sekali pun, jadi tiada apa yang
        mengesahkan dia benar-benar mengingatinya.
      */
      setAuthNotice('Kata laluan berjaya ditukar. Sila log masuk dengan kata laluan baharu anda.');
      await signOutFromDevice();
      router.replace('/(auth)/login');
    } catch (caught) {
      setError(toMalayError(caught, 'Gagal menukar kata laluan. Sila cuba lagi.'));
    } finally {
      setBusy(false);
    }
  }, [busy, confirm, password, router]);

  if (phase.step === 'menyemak') return <LoadingScreen />;

  return (
    <View className="flex-1 bg-background">
      <Screen>
        <View className="gap-6 px-gutter">
          <View className="items-center pb-2 pt-12">
            <View className="h-20 w-20 items-center justify-center rounded-[24px] bg-primary">
              <Ionicons name="lock-open" size={34} color={Colors.white} />
            </View>
            <Text className="mt-5 text-2xl font-bold text-ink">Kata Laluan Baharu</Text>
            <Text className="mt-1.5 px-4 text-center text-sm leading-5 text-ink-muted">
              {phase.step === 'sedia'
                ? 'Tetapkan kata laluan baharu untuk akaun anda.'
                : 'Pautan tidak dapat digunakan.'}
            </Text>
          </View>

          {phase.step === 'tidak-sah' ? (
            <>
              <Notice tone="negative" message={phase.message} />
              <Button label="Kembali ke Log Masuk" onPress={() => router.replace('/(auth)/login')} />
            </>
          ) : (
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

                <Button label="Simpan Kata Laluan" loading={busy} disabled={busy} onPress={() => void submit()} />
              </View>
            </Card>
          )}
        </View>
      </Screen>
    </View>
  );
}
