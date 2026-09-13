import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';

import { ContactAdminLink } from '@/components/contact-admin';
import { ForgotPasswordSheet } from '@/components/forgot-password';
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

/* Nisbah asal fail logo (1090x367) — tinggi dikira daripada lebar supaya imej
   tidak pernah diregangkan pada mana-mana saiz skrin. */
const LOGO_ASPECT_RATIO = 1090 / 367;

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  /* Sebab log keluar automatik (contoh: akaun disekat), diserahkan oleh
     `app/(app)/_layout.tsx` yang tidak sempat memaparkannya sendiri. */
  const [notice, setNotice] = useState<string | null>(() => takeAuthNotice());
  const [busy, setBusy] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  // Papar butang biometrik hanya bila peranti menyokong DAN pengguna pernah aktifkan.
  useEffect(() => {
    let active = true;

    void (async () => {
      const [support, available] = await Promise.all([getBiometricSupport(), hasBiometricLogin()]);
      if (!active) return;
      setBiometricAvailable(support.usable && available);
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
          {/*
            Logo sudah membawa nama dan tagline sendiri, jadi tiada tajuk atau
            subtajuk teks di sini — satu suara sahaja di kepala skrin.
          */}
          <View className="items-center pb-10 pt-12">
            <Image
              source={require('@/assets/images/mysaff-logo-wide.png')}
              style={{ width: '55%', maxWidth: 220, aspectRatio: LOGO_ASPECT_RATIO }}
              contentFit="contain"
              accessibilityLabel="MySAFF — Melangkah Bersama"
            />
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

              {/*
                Diletakkan terus di bawah medan kata laluan: itulah tempat mata
                berada apabila seseorang sedar dia tidak ingat kata laluannya.
              */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Lupa kata laluan"
                hitSlop={8}
                onPress={() => setForgotOpen(true)}
                className="self-end active:opacity-70">
                <Text className="text-sm font-semibold text-primary">Lupa Kata Laluan?</Text>
              </Pressable>

              {notice ? <Notice tone="warn" message={notice} /> : null}
              {error ? <Notice tone="negative" message={error} /> : null}

              <Button label="Log Masuk" onPress={() => void signIn()} loading={busy} disabled={biometricBusy} />
            </View>
          </Card>

          {biometricAvailable ? (
            <View className="mt-5">
              <Button
                label="Log Masuk dengan Fingerprint atau Face ID"
                variant="ghost"
                loading={biometricBusy}
                disabled={busy}
                onPress={() => void signInWithBiometric()}
                icon={<Ionicons name="finger-print" size={18} color={Colors.primary} />}
              />
            </View>
          ) : null}

          {/*
            Diletakkan di bawah borang dan bukan disembunyikan dalam menu:
            orang yang paling memerlukan nombor ini ialah orang yang baru sahaja
            gagal log masuk, dan dia sedang memandang tepat ke bahagian ini.
          */}
          <View className="mt-2">
            <ContactAdminLink />
          </View>

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

      <ForgotPasswordSheet visible={forgotOpen} initialEmail={email} onClose={() => setForgotOpen(false)} />
    </KeyboardAvoidingView>
  );
}
