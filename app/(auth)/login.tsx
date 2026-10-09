import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { ContactAdminLink } from '@/components/contact-admin';
import { ForgotPasswordSheet } from '@/components/forgot-password';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { getBiometricSupport, getStoredRefreshToken, hasBiometricLogin, promptBiometric } from '@/lib/biometrics';
import { toMalayError } from '@/lib/errors';
import { resetIdleTracking } from '@/lib/idle-timer';
import { getRecentLogins, saveRecentLogin } from '@/lib/recent-logins';
import { takeAuthNotice } from '@/lib/suspension';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';

/* Nisbah asal fail logo (1090x367) — tinggi dikira daripada lebar supaya imej
   tidak pernah diregangkan pada mana-mana saiz skrin. */
const LOGO_ASPECT_RATIO = 1090 / 367;

export default function LoginScreen() {
  const colors = useColors();
  const router = useRouter();
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
  const [recentEmails, setRecentEmails] = useState<string[]>([]);
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    let active = true;
    void getRecentLogins().then((list) => {
      if (active) setRecentEmails(list);
    });
    return () => {
      active = false;
    };
  }, []);

  const pickRecentEmail = useCallback((value: string) => {
    setEmail(value);
    passwordRef.current?.focus();
  }, []);

  // Tiada sesi di sini — cap masa aktiviti lama tidak boleh melog keluar log masuk seterusnya.
  useEffect(() => {
    resetIdleTracking();
  }, []);

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

    if (signInError) {
      setError(toMalayError(signInError, 'Gagal log masuk. Sila cuba lagi.'));
      return;
    }

    // Hanya emel yang benar-benar berjaya log masuk disimpan sebagai cadangan.
    void saveRecentLogin(email);
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
    <View className="flex-1 bg-background">
      <Screen>
        <View className="px-gutter">
          {/*
            Logo sudah membawa nama dan tagline sendiri, jadi tiada tajuk atau
            subtajuk teks di sini — satu suara sahaja di kepala skrin.
          */}
          <View className="items-center pb-10 pt-12">
            <Image
              source={require('@/assets/images/mysaff-logo-wide.png')}
              // Logo berlatar putih — bucu dibulatkan supaya tidak kelihatan seperti kotak tajam pada tema gelap.
              style={{ width: '55%', maxWidth: 220, aspectRatio: LOGO_ASPECT_RATIO, borderRadius: 14 }}
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
                onSubmitEditing={() => passwordRef.current?.focus()}
              />

              {/* Cadangan isi pantas — disorok sepenuhnya jika tiada emel tersimpan atau medan sudah diisi. */}
              {recentEmails.length > 0 && !email ? (
                <View className="-mt-2 flex-row flex-wrap gap-2">
                  {recentEmails.map((item) => (
                    <Pressable
                      key={item}
                      accessibilityRole="button"
                      accessibilityLabel={`Guna emel ${item}`}
                      onPress={() => pickRecentEmail(item)}
                      className="max-w-full flex-row items-center gap-1.5 rounded-full border border-line bg-background px-3 py-1.5 active:opacity-70">
                      <Ionicons name="time-outline" size={14} color={colors.inkMuted} />
                      <Text numberOfLines={1} className="shrink text-sm text-ink">
                        {item}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <TextField
                inputRef={passwordRef}
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
                label="Fingerprint / Face ID"
                variant="ghost"
                loading={biometricBusy}
                disabled={busy}
                onPress={() => void signInWithBiometric()}
                icon={<Ionicons name="finger-print" size={18} color={colors.primary} />}
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

          {/* Pautan awam (syarat Google Play): boleh dibuka tanpa log masuk. */}
          <View className="mt-4 flex-row items-center justify-center gap-4">
            <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push('/dasar-privasi')}>
              <Text className="text-sm text-ink-muted underline">Dasar Privasi</Text>
            </Pressable>
            <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push('/padam-akaun')}>
              <Text className="text-sm text-ink-muted underline">Padam Akaun</Text>
            </Pressable>
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
    </View>
  );
}
