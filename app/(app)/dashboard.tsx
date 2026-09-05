import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { ActionRow } from '@/components/ui/action-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormModal } from '@/components/ui/form-modal';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { StatCard } from '@/components/ui/stat-card';
import { TextField } from '@/components/ui/text-field';
import { ToggleRow } from '@/components/ui/toggle-row';
import { displayName, useAuth } from '@/lib/auth-context';
import {
  disableBiometric,
  enableBiometric,
  getBiometricSupport,
  isBiometricEnabled,
  promptBiometric,
  type BiometricSupport,
} from '@/lib/biometrics';
import { toMalayError } from '@/lib/errors';
import { signOutFromDevice } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
/** Em dash sebagai placeholder nilai yang belum ada. */
const DASH = '—';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

export default function DashboardScreen() {
  const { user } = useAuth();

  const [banner, setBanner] = useState<Banner>(null);

  // --- Biometrik -----------------------------------------------------------
  const [support, setSupport] = useState<BiometricSupport | null>(null);
  const [biometricOn, setBiometricOn] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      const [nextSupport, enabled] = await Promise.all([getBiometricSupport(), isBiometricEnabled()]);
      if (!active) return;
      setSupport(nextSupport);
      setBiometricOn(enabled);
    })();

    return () => {
      active = false;
    };
  }, []);

  const toggleBiometric = useCallback(async (next: boolean) => {
    setBanner(null);
    setBiometricBusy(true);

    try {
      if (!next) {
        await disableBiometric();
        setBiometricOn(false);
        setBanner({ tone: 'info', message: 'Log masuk biometrik telah dimatikan.' });
        return;
      }

      // Sahkan identiti dahulu sebelum mengaktifkan.
      const approved = await promptBiometric('Sahkan identiti anda untuk aktifkan log masuk biometrik');
      if (!approved) {
        setBanner({ tone: 'negative', message: 'Pengesahan biometrik dibatalkan.' });
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      const refreshToken = data.session?.refresh_token;
      if (error || !refreshToken) {
        setBanner({ tone: 'negative', message: 'Sesi tidak sah. Sila log masuk semula.' });
        return;
      }

      await enableBiometric(refreshToken);
      setBiometricOn(true);
      setBanner({ tone: 'positive', message: 'Log masuk biometrik telah diaktifkan.' });
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal mengemas kini tetapan biometrik.') });
    } finally {
      setBiometricBusy(false);
    }
  }, []);

  // --- Tukar emel ----------------------------------------------------------
  const [emailModal, setEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const submitEmail = useCallback(async () => {
    setEmailError(null);
    const value = newEmail.trim();

    if (!EMAIL_PATTERN.test(value)) {
      setEmailError('Format emel tidak sah.');
      return;
    }
    if (value.toLowerCase() === user?.email?.toLowerCase()) {
      setEmailError('Emel baharu sama dengan emel semasa.');
      return;
    }

    setEmailBusy(true);
    const { error } = await supabase.auth.updateUser({ email: value });
    setEmailBusy(false);

    if (error) {
      setEmailError(toMalayError(error, 'Gagal menukar emel.'));
      return;
    }

    setEmailModal(false);
    setNewEmail('');
    setBanner({
      tone: 'positive',
      message: 'Pautan pengesahan telah dihantar. Sila sahkan melalui emel lama dan emel baharu.',
    });
  }, [newEmail, user?.email]);

  // --- Tukar kata laluan ---------------------------------------------------
  const [passwordModal, setPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);

  const submitPassword = useCallback(async () => {
    setPasswordError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError('Kata laluan mesti sekurang-kurangnya ' + MIN_PASSWORD_LENGTH + ' aksara.');
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError('Pengesahan kata laluan tidak sepadan.');
      return;
    }

    setPasswordBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setPasswordBusy(false);

    if (error) {
      setPasswordError(toMalayError(error, 'Gagal menukar kata laluan.'));
      return;
    }

    setPasswordModal(false);
    setPassword('');
    setConfirmPassword('');
    setBanner({ tone: 'positive', message: 'Kata laluan berjaya dikemas kini.' });
  }, [password, confirmPassword]);

  // --- Log keluar ----------------------------------------------------------
  const [signOutBusy, setSignOutBusy] = useState(false);

  const signOut = useCallback(async () => {
    setSignOutBusy(true);
    // Bila biometrik aktif, sesi pelayan dikekalkan supaya refresh token tersimpan
    // masih sah untuk log masuk biometrik seterusnya — lihat lib/session.ts.
    const { error } = await signOutFromDevice();
    setSignOutBusy(false);

    if (error) setBanner({ tone: 'negative', message: toMalayError(error, 'Gagal log keluar.') });
  }, []);

  const biometricSubtitle = !support
    ? 'Menyemak sokongan peranti...'
    : !support.hasHardware
      ? 'Peranti ini tiada pengimbas biometrik.'
      : !support.isEnrolled
        ? 'Daftarkan biometrik dalam tetapan peranti dahulu.'
        : 'Guna ' + support.label + ' untuk log masuk seterusnya.';

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader
          eyebrow="Assalamualaikum,"
          title={displayName(user)}
          subtitle={user?.email ?? undefined}
          onBellPress={() => setBanner({ tone: 'info', message: 'Tiada notifikasi baharu buat masa ini.' })}
        />

        <View className="gap-6 px-gutter pt-6">
          {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

          {/* Ringkasan utama - satu maklumat besar sahaja. */}
          <Card tone="primary">
            <Text className="text-sm text-white/70">Kehadiran bulan ini</Text>
            <Text className="mt-2 text-stat-lg font-bold text-white/50">{DASH}</Text>
            <Text className="mt-2 text-sm text-white/70">Modul kehadiran belum disambung ke pangkalan data.</Text>
          </Card>

          <View>
            <SectionTitle title="Ringkasan" caption="Data akan dikemas kini secara automatik." />
            <View className="gap-4">
              <View className="flex-row gap-4">
                <StatCard className="flex-1" tone="positive" muted value={DASH} label="Hadir" />
                <StatCard className="flex-1" tone="negative" muted value={DASH} label="Tidak hadir" />
              </View>
              <View className="flex-row gap-4">
                <StatCard className="flex-1" tone="warn" muted value={DASH} label="Lewat" />
                <StatCard className="flex-1" tone="info" muted value={DASH} label="Aktiviti" />
              </View>
            </View>
          </View>

          <View>
            <SectionTitle title="Tetapan Akaun" />
            <View className="gap-4">
              <ToggleRow
                icon="finger-print"
                title="Log Masuk Biometrik"
                subtitle={biometricSubtitle}
                value={biometricOn}
                onValueChange={(next) => void toggleBiometric(next)}
                disabled={!support?.usable}
                busy={biometricBusy}
              />

              <ActionRow
                icon="mail-outline"
                title="Tukar Emel"
                subtitle={user?.email ?? undefined}
                onPress={() => {
                  setEmailError(null);
                  setNewEmail('');
                  setEmailModal(true);
                }}
              />

              <ActionRow
                icon="lock-closed-outline"
                title="Tukar Kata Laluan"
                subtitle="Minimum 8 aksara"
                onPress={() => {
                  setPasswordError(null);
                  setPassword('');
                  setConfirmPassword('');
                  setPasswordModal(true);
                }}
              />
            </View>
          </View>

          <Button label="Log Keluar" variant="danger" loading={signOutBusy} onPress={() => void signOut()} />
        </View>
      </Screen>

      <FormModal
        visible={emailModal}
        title="Tukar Emel"
        description="Pautan pengesahan akan dihantar ke emel lama dan emel baharu."
        onClose={() => setEmailModal(false)}>
        <TextField
          label="Emel baharu"
          placeholder="nama@contoh.com"
          value={newEmail}
          onChangeText={setNewEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          error={emailError}
        />
        <Button label="Simpan Emel" loading={emailBusy} onPress={() => void submitEmail()} />
      </FormModal>

      <FormModal
        visible={passwordModal}
        title="Tukar Kata Laluan"
        description="Kata laluan mesti sekurang-kurangnya 8 aksara."
        onClose={() => setPasswordModal(false)}>
        <TextField
          label="Kata laluan baharu"
          placeholder="Masukkan kata laluan baharu"
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          textContentType="newPassword"
          secure
        />
        <TextField
          label="Sahkan kata laluan"
          placeholder="Masukkan semula kata laluan"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          autoCapitalize="none"
          textContentType="newPassword"
          error={passwordError}
          secure
        />
        <Button label="Simpan Kata Laluan" loading={passwordBusy} onPress={() => void submitPassword()} />
      </FormModal>
    </>
  );
}
