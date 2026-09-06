import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Colors } from '@/constants/theme';
import { getBiometricSupport, getStoredRefreshToken, hasBiometricLogin, promptBiometric } from '@/lib/biometrics';
import { toMalayError } from '@/lib/errors';
import { takeAuthNotice } from '@/lib/suspension';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  /* Sebab log keluar automatik (contoh: akaun disekat), diserahkan oleh
     `app/(app)/_layout.tsx` yang tidak sempat memaparkannya sendiri. */
  const [notice, setNotice] = useState<string | null>(() => takeAuthNotice());
  const [busy, setBusy] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState<string | null>(null);

  // Papar butang biometrik hanya bila peranti menyokong DAN pengguna pernah aktifkan.
  useEffect(() => {
    let active = true;

    void (async () => {
      const [support, available] = await Promise.all([getBiometricSupport(), hasBiometricLogin()]);
      if (!active) return;
      setBiometricLabel(support.usable && available ? support.label : null);
    })();

    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async () => {
    setError(null);

    if (!isSupabaseConfigured) {
      setError('Sambungan Supabase belum disediakan. Sila isi fail .env.');
      return;
    }
    if (!email.trim() || !password) {
      setError('Sila isi emel dan kata laluan.');
      return;
    }

    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);

    if (signInError) setError(toMalayError(signInError, 'Gagal log masuk. Sila cuba lagi.'));
  }, [email, password]);

  const signInWithBiometric = useCallback(async () => {
    setError(null);

    const token = await getStoredRefreshToken();
    if (!token) {
      setError('Sesi biometrik tidak ditemui. Sila log masuk dengan kata laluan.');
      return;
    }

    const approved = await promptBiometric('Sahkan identiti anda untuk log masuk');
    if (!approved) return;

    setBiometricBusy(true);
    const { error: refreshError } = await supabase.auth.refreshSession({ refresh_token: token });
    setBiometricBusy(false);

    // Kegagalan di sini TIDAK mematikan ciri biometrik. Bendera dan token kekal
    // tersimpan supaya butang ini masih ada selepas log masuk kata laluan; hanya
    // pengguna yang boleh OFF-kan ciri ini melalui toggle di Dashboard.
    if (refreshError) {
      setError('Gagal memulihkan sesi biometrik. Sila log masuk dengan kata laluan kali ini.');
    }
  }, []);

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View className="px-gutter">
          {/* Logo placeholder + tajuk */}
          <View className="items-center pb-10 pt-12">
            <View className="h-20 w-20 items-center justify-center rounded-[24px] bg-primary">
              <Ionicons name="moon" size={34} color={Colors.white} />
            </View>
            <Text className="mt-5 text-2xl font-bold text-ink">mysaf-off</Text>
            <Text className="mt-1.5 text-sm text-ink-muted">Sistem pengurusan saf & kehadiran</Text>
          </View>

          <Card>
            <View className="gap-5">
              <Text className="text-lg font-bold text-ink">Log Masuk</Text>

              <TextField
                label="Emel"
                placeholder="nama@contoh.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
              />

              <TextField
                label="Kata Laluan"
                placeholder="Masukkan kata laluan"
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={() => void signIn()}
                secure
              />

              {notice ? <Notice tone="warn" message={notice} /> : null}
              {error ? <Notice tone="negative" message={error} /> : null}

              <Button label="Log Masuk" onPress={() => void signIn()} loading={busy} disabled={biometricBusy} />
            </View>
          </Card>

          {biometricLabel ? (
            <View className="mt-5">
              <Button
                label={`Log Masuk dengan ${biometricLabel}`}
                variant="ghost"
                loading={biometricBusy}
                disabled={busy}
                onPress={() => void signInWithBiometric()}
                icon={<Ionicons name="finger-print" size={18} color={Colors.primary} />}
              />
            </View>
          ) : null}

          {!isSupabaseConfigured ? (
            <View className="mt-5">
              <Notice
                tone="warn"
                message="EXPO_PUBLIC_SUPABASE_URL dan EXPO_PUBLIC_SUPABASE_ANON_KEY belum diisi dalam fail .env."
              />
            </View>
          ) : null}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
