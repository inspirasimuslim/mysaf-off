import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { ActionRow } from '@/components/ui/action-row';
import { Button } from '@/components/ui/button';
import { FormModal } from '@/components/ui/form-modal';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { ToggleRow } from '@/components/ui/toggle-row';
import { ToastBanner } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions';
import {
  disableBiometric,
  enableBiometric,
  getBiometricSupport,
  isBiometricEnabled,
  promptBiometric,
  type BiometricSupport,
} from '@/lib/biometrics';
import { errorCode, toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { hasPendingAccountDeletion, requestAccountDeletion } from '@/lib/account-deletion';
import { signOutFromDevice } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MISMATCH_MESSAGE = 'Pengesahan kata laluan tidak sepadan.';

/** Kod ralat yang berpunca daripada nilai yang ditaip, jadi dipapar di bawah medan berkenaan. */
const EMAIL_FIELD_CODES = [
  'email_exists',
  'user_already_exists',
  'email_address_invalid',
  'email_address_not_authorized',
  'email_conflict_identity_not_deletable',
  'validation_failed',
];
const PASSWORD_FIELD_CODES = ['weak_password', 'same_password', 'validation_failed'];

/**
 * Tentukan sama ada ralat patut dipapar inline (bawah medan) atau sebagai notis borang.
 * Ralat rangkaian / sesi tamat bukan salah nilai yang ditaip, jadi ia naik ke notis
 * borang supaya pengguna tidak tersalah sangka nilai merekalah yang bermasalah.
 */
function belongsToField(error: unknown, codes: string[], messagePattern: RegExp): boolean {
  const code = errorCode(error);
  if (code) return codes.includes(code);
  const raw = error instanceof Error ? error.message : '';
  return messagePattern.test(raw);
}

function validatePassword(value: string): string | null {
  if (!value) return 'Sila masukkan kata laluan baharu.';
  if (value.length < MIN_PASSWORD_LENGTH) {
    return 'Kata laluan mesti sekurang-kurangnya ' + MIN_PASSWORD_LENGTH + ' aksara.';
  }
  return null;
}

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

/**
 * Tetapan akaun — emel, kata laluan, biometrik dan log keluar.
 *
 * Skrin ini dahulunya sebahagian daripada Dashboard. Logiknya dipindahkan
 * seadanya; yang berubah hanyalah tempat ia tinggal, supaya Dashboard kembali
 * kepada ringkasan sahaja dan tetapan akaun berada rapat dengan Profil.
 */
export default function TetapanScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const goBack = useGoBack();
  const { isOwner } = usePermissions();

  const [banner, setBanner] = useState<Banner>(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  useEffect(() => {
    void hasPendingAccountDeletion()
      .then(setDeletePending)
      .catch(() => setDeletePending(false));
  }, []);

  const submitDelete = async () => {
    if (deleteBusy) return;
    setDeleteBusy(true);
    try {
      await requestAccountDeletion(deleteReason);
      setDeletePending(true);
      setDeleteModal(false);
      setDeleteReason('');
      setBanner({ tone: 'positive', message: 'Permintaan padam akaun dihantar. Pentadbir akan memprosesnya.' });
    } catch (caught) {
      setDeleteModal(false);
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menghantar permintaan.') });
    } finally {
      setDeleteBusy(false);
    }
  };

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
  /** Ralat pada medan emel itu sendiri (format salah, sudah digunakan). */
  const [emailError, setEmailError] = useState<string | null>(null);
  /** Ralat am borang (rangkaian, sesi tamat, had kadar). */
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const validateEmail = useCallback(
    (value: string): string | null => {
      const trimmed = value.trim();
      if (!trimmed) return 'Sila masukkan emel baharu.';
      if (!EMAIL_PATTERN.test(trimmed)) return 'Format emel tidak sah. Contoh: nama@contoh.com';
      if (user?.email && trimmed.toLowerCase() === user.email.toLowerCase()) {
        return 'Emel baharu sama dengan emel semasa.';
      }
      return null;
    },
    [user?.email],
  );

  const openEmailModal = useCallback(() => {
    setBanner(null);
    setNewEmail('');
    setEmailError(null);
    setEmailNotice(null);
    setEmailBusy(false);
    setEmailModal(true);
  }, []);

  const changeEmail = useCallback(
    (value: string) => {
      setNewEmail(value);
      setEmailNotice(null);
      // Ralat yang sudah terpapar dinilai semula supaya ia hilang sebaik dibetulkan.
      if (emailError) setEmailError(validateEmail(value));
    },
    [emailError, validateEmail],
  );

  const submitEmail = useCallback(async () => {
    if (emailBusy) return;

    const value = newEmail.trim();
    const invalid = validateEmail(value);
    setEmailNotice(null);
    setEmailError(invalid);
    if (invalid) return;

    setEmailBusy(true);
    try {
      const { data, error } = await supabase.auth.updateUser({ email: value });

      if (error) {
        const message = toMalayError(error, 'Gagal menukar emel. Sila cuba lagi.');
        if (belongsToField(error, EMAIL_FIELD_CODES, /email|registered/i)) setEmailError(message);
        else setEmailNotice(message);
        return;
      }

      // Emel BELUM bertukar di sini — Supabase hanya menghantar pautan pengesahan.
      // `new_email` ialah emel yang menunggu pengesahan; nilai taipan jadi sandaran.
      const pending = data.user?.new_email || value;
      setEmailModal(false);
      setNewEmail('');
      setEmailError(null);
      setBanner({
        tone: 'positive',
        message:
          'Pautan pengesahan telah dihantar ke ' +
          pending +
          '. Sila buka emel BAHARU itu dan klik pautan tersebut — emel akaun anda belum bertukar sehingga pengesahan selesai.' +
          (user?.email ? ' Jika pengesahan berganda diaktifkan, semak juga peti masuk ' + user.email + '.' : ''),
      });
    } catch (caught) {
      setEmailNotice(toMalayError(caught, 'Gagal menukar emel. Sila cuba lagi.'));
    } finally {
      // finally memastikan butang tidak kekal terkunci walau apa pun yang berlaku.
      setEmailBusy(false);
    }
  }, [emailBusy, newEmail, user?.email, validateEmail]);

  // --- Tukar kata laluan ---------------------------------------------------
  const [passwordModal, setPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  /** Ralat am borang (rangkaian, sesi tamat, had kadar). */
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);

  const openPasswordModal = useCallback(() => {
    setBanner(null);
    setPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setConfirmError(null);
    setPasswordNotice(null);
    setPasswordBusy(false);
    setPasswordModal(true);
  }, []);

  const changePassword = useCallback(
    (value: string) => {
      setPassword(value);
      setPasswordNotice(null);
      if (passwordError) setPasswordError(validatePassword(value));
      // Padanan dinilai semula supaya ralat "tidak sepadan" tidak tertinggal.
      if (confirmPassword) setConfirmError(confirmPassword === value ? null : MISMATCH_MESSAGE);
    },
    [confirmPassword, passwordError],
  );

  const changeConfirmPassword = useCallback(
    (value: string) => {
      setConfirmPassword(value);
      setPasswordNotice(null);
      // Maklum balas serta-merta semasa menaip, bukan tunggu butang ditekan.
      setConfirmError(value && value !== password ? MISMATCH_MESSAGE : null);
    },
    [password],
  );

  const submitPassword = useCallback(async () => {
    if (passwordBusy) return;

    const invalidPassword = validatePassword(password);
    const invalidConfirm = !confirmPassword
      ? 'Sila sahkan kata laluan baharu.'
      : confirmPassword !== password
        ? MISMATCH_MESSAGE
        : null;

    setPasswordNotice(null);
    setPasswordError(invalidPassword);
    setConfirmError(invalidConfirm);
    if (invalidPassword || invalidConfirm) return;

    setPasswordBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        const message = toMalayError(error, 'Gagal menukar kata laluan. Sila cuba lagi.');
        if (belongsToField(error, PASSWORD_FIELD_CODES, /password/i)) setPasswordError(message);
        else setPasswordNotice(message);
        return;
      }

      // Sesi semasa dikekalkan oleh Supabase — tiada log keluar paksa diperlukan.
      // Medan dikosongkan supaya kata laluan tidak tertinggal pada skrin.
      setPasswordModal(false);
      setPassword('');
      setConfirmPassword('');
      setPasswordError(null);
      setConfirmError(null);
      setBanner({
        tone: 'positive',
        message: 'Kata laluan berjaya dikemas kini. Anda kekal log masuk pada peranti ini.',
      });
    } catch (caught) {
      setPasswordNotice(toMalayError(caught, 'Gagal menukar kata laluan. Sila cuba lagi.'));
    } finally {
      setPasswordBusy(false);
    }
  }, [confirmPassword, password, passwordBusy]);

  // --- Log keluar ----------------------------------------------------------
  const [signOutBusy, setSignOutBusy] = useState(false);

  const signOut = useCallback(async () => {
    if (signOutBusy) return;

    setSignOutBusy(true);
    try {
      // Bila biometrik aktif, sesi pelayan dikekalkan supaya refresh token tersimpan
      // masih sah untuk log masuk biometrik seterusnya — lihat lib/session.ts.
      const { error } = await signOutFromDevice();
      if (error) setBanner({ tone: 'negative', message: toMalayError(error, 'Gagal log keluar.') });
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal log keluar.') });
    } finally {
      setSignOutBusy(false);
    }
  }, [signOutBusy]);

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
        <ScreenHeader title="Tetapan" subtitle={user?.email ?? undefined} onBackPress={goBack} />

        <View className="gap-6 px-gutter pt-6">
          {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

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
                onPress={openEmailModal}
              />

              <ActionRow
                icon="lock-closed-outline"
                title="Tukar Kata Laluan"
                onPress={openPasswordModal}
              />
            </View>
          </View>

          {/*
            Album dan Arkib sudah berpindah ke tab Arkib, dan Maklum Balas ke skrin
            Direktori Ahli. Bahagian ini kini hanya untuk Owner.
          */}
          {isOwner() ? (
            <View>
              <SectionTitle title="Lain-lain" />
              <View className="gap-4">
                {/* Owner sahaja — pemulihan kecemasan, tiada di Hub Admin. */}
                <ActionRow
                  icon="shield-half-outline"
                  title="Pemulihan Kecemasan"
                  subtitle="Lantik / turunkan Super Admin"
                  tone="danger"
                  onPress={() => router.push('/(app)/admin/owner-recovery')}
                />
              </View>
            </View>
          ) : null}

          <View>
            <SectionTitle title="Privasi" />
            <View className="gap-4">
              <ActionRow
                icon="document-text-outline"
                title="Dasar Privasi"
                onPress={() => router.push('/dasar-privasi')}
              />
              <ActionRow
                icon="trash-outline"
                title="Padam Akaun"
                subtitle={deletePending ? 'Permintaan anda sedang diproses' : 'Mohon akaun dan data anda dipadam'}
                tone="danger"
                onPress={() => (deletePending ? undefined : setDeleteModal(true))}
              />
            </View>
          </View>

          <Button label="Log Keluar" variant="danger" loading={signOutBusy} onPress={() => void signOut()} />
        </View>
      </Screen>

      <FormModal
        visible={deleteModal}
        centerOnDesktop
        title="Padam Akaun"
        description="Permintaan akan dihantar kepada pentadbir. Selepas diproses, akaun log masuk dan data peribadi anda dipadam atau dianonimkan. Rekod kewangan persatuan (yuran, sumbangan) mungkin disimpan tanpa identiti peribadi untuk tujuan audit."
        dismissable={!deleteBusy}
        onClose={() => setDeleteModal(false)}>
        <TextField
          label="Sebab (pilihan)"
          placeholder="Contoh: sudah tidak aktif"
          value={deleteReason}
          onChangeText={setDeleteReason}
          multiline
          maxLength={500}
          editable={!deleteBusy}
        />
        <Button
          label="Hantar Permintaan Padam"
          variant="danger"
          loading={deleteBusy}
          disabled={deleteBusy}
          onPress={() => void submitDelete()}
        />
      </FormModal>

      <FormModal
        visible={emailModal}
        centerOnDesktop
        title="Tukar Emel"
        description="Emel hanya bertukar selepas anda klik pautan pengesahan yang dihantar ke emel baharu."
        dismissable={!emailBusy}
        onClose={() => setEmailModal(false)}>
        {emailNotice ? <Notice tone="negative" message={emailNotice} /> : null}

        <TextField
          label="Emel baharu"
          placeholder="nama@contoh.com"
          value={newEmail}
          onChangeText={changeEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="go"
          editable={!emailBusy}
          onSubmitEditing={() => void submitEmail()}
          error={emailError}
        />

        <Button label="Simpan Emel" loading={emailBusy} disabled={emailBusy} onPress={() => void submitEmail()} />
      </FormModal>

      <FormModal
        visible={passwordModal}
        centerOnDesktop
        title="Tukar Kata Laluan"
        description={
          'Kata laluan mesti sekurang-kurangnya ' +
          MIN_PASSWORD_LENGTH +
          ' aksara. Anda kekal log masuk selepas menukarnya.'
        }
        dismissable={!passwordBusy}
        onClose={() => setPasswordModal(false)}>
        {passwordNotice ? <Notice tone="negative" message={passwordNotice} /> : null}

        <TextField
          label="Kata laluan baharu"
          placeholder="Masukkan kata laluan baharu"
          value={password}
          onChangeText={changePassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          editable={!passwordBusy}
          error={passwordError}
          secure
        />

        <TextField
          label="Sahkan kata laluan"
          placeholder="Masukkan semula kata laluan"
          value={confirmPassword}
          onChangeText={changeConfirmPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          editable={!passwordBusy}
          onSubmitEditing={() => void submitPassword()}
          error={confirmError}
          secure
        />

        <Button
          label="Simpan Kata Laluan"
          loading={passwordBusy}
          disabled={passwordBusy}
          onPress={() => void submitPassword()}
        />
      </FormModal>

    </>
  );
}
