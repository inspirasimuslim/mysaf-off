import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FormModal } from '@/components/ui/form-modal';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { useMemberAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { createMemberAccount, fetchGenerations, type CreatedMember } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import {
  KAWASAN_USRAH_OPTIONS,
  generationOrder,
  type Generation,
  type Option,
} from '@/types/database';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Tambah ahli baharu — cipta akaun log masuk dan rekod ahli sekali gus.
 *
 * Kerja sebenar berlaku dalam Edge Function `admin-create-member`, kerana
 * mencipta akaun memerlukan `service_role`. Skrin ini mengumpul empat medan,
 * dan yang paling penting: memaparkan kata laluan sementara SEKALI sahaja.
 */
export default function AhliTambahScreen() {
  const goBack = useGoBack();
  const { loading: accessLoading, canEdit } = useMemberAccess();

  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [generasi, setGenerasi] = useState<string | null>(null);
  const [kawasanUsrah, setKawasanUsrah] = useState<string | null>(null);

  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [generasiError, setGenerasiError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Hasil kejayaan — kata laluan di dalamnya hanya wujud dalam memori skrin ini. */
  const [created, setCreated] = useState<CreatedMember | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (accessLoading || !canEdit) {
      if (!accessLoading) setLoading(false);
      return;
    }
    let active = true;

    void (async () => {
      try {
        const rows = await fetchGenerations();
        if (!active) return;
        setGenerations(rows);
      } catch (caught) {
        if (active) setNotice(toMalayError(caught, 'Gagal memuatkan senarai generasi.'));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [accessLoading, canEdit]);

  // Hanya generasi aktif boleh dipilih untuk ahli baharu.
  const generationOptions: Option<string>[] = generations
    .filter((row) => row.is_active)
    .sort((a, b) => generationOrder(a.code) - generationOrder(b.code))
    .map((row) => ({ value: row.code, label: row.label }));

  const submit = useCallback(async () => {
    if (busy) return;

    const name = fullName.trim();
    const mail = email.trim().toLowerCase();

    const invalidName = !name ? 'Sila masukkan nama penuh.' : null;
    const invalidEmail = !mail
      ? 'Sila masukkan emel.'
      : !EMAIL_PATTERN.test(mail)
        ? 'Format emel tidak sah. Contoh: nama@contoh.com'
        : null;
    const invalidGenerasi = !generasi ? 'Sila pilih generasi.' : null;

    setNotice(null);
    setNameError(invalidName);
    setEmailError(invalidEmail);
    setGenerasiError(invalidGenerasi);
    if (invalidName || invalidEmail || invalidGenerasi) return;

    setBusy(true);
    try {
      const result = await createMemberAccount({
        full_name: name,
        email: mail,
        generasi: generasi as string,
        kawasan_usrah: kawasanUsrah,
      });

      setCopied(false);
      setCreated(result);

      // Borang dikosongkan supaya ahli seterusnya boleh ditambah terus, dan
      // supaya tiada nama tertinggal pada skrin selepas modal ditutup.
      setFullName('');
      setEmail('');
      setGenerasi(null);
      setKawasanUsrah(null);
    } catch (caught) {
      setNotice(toMalayError(caught, 'Gagal mencipta akaun ahli.'));
    } finally {
      setBusy(false);
    }
  }, [busy, email, fullName, generasi, kawasanUsrah]);

  const copyPassword = useCallback(async () => {
    if (!created) return;
    await Clipboard.setStringAsync(created.password);
    setCopied(true);
  }, [created]);

  if (accessLoading || loading) return <LoadingScreen />;

  if (!canEdit) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Tambah Ahli" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Menambah ahli memerlukan kebenaran menyunting pada department JABATAN DATA & SUMBER MANUSIA."
          />
        </View>
      </Screen>
    );
  }

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader
          eyebrow="Panel Admin"
          title="Tambah Ahli"
          subtitle="Cipta akaun log masuk dan rekod ahli"
          onBackPress={goBack}
        />

        <View className="gap-6 px-gutter pt-6">
          {notice ? <Notice tone="negative" message={notice} /> : null}

          <Notice
            tone="info"
            message="Akaun baharu terus boleh log masuk — tiada emel pengesahan dihantar. Kata laluan sementara dipapar sekali sahaja selepas ahli dicipta."
          />

          <View>
            <SectionTitle title="Maklumat Ahli" caption="Nombor ahli diberikan secara automatik selepas nombor terakhir." />
            <View className="gap-4">
              <TextField
                label="Nama penuh"
                placeholder="Contoh: AHMAD BIN ALI"
                value={fullName}
                onChangeText={(value) => {
                  setFullName(value);
                  if (nameError) setNameError(null);
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!busy}
                error={nameError}
              />

              <TextField
                label="Emel"
                placeholder="nama@contoh.com"
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  if (emailError) setEmailError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!busy}
                error={emailError}
              />

              <PickerField
                label="Generasi"
                value={generasi}
                options={generationOptions}
                onChange={(next) => {
                  setGenerasi(next);
                  if (generasiError) setGenerasiError(null);
                }}
                clearable={false}
                disabled={busy}
                error={generasiError}
              />

              <PickerField
                label="Kawasan usrah"
                value={kawasanUsrah}
                options={KAWASAN_USRAH_OPTIONS}
                onChange={setKawasanUsrah}
                disabled={busy}
              />
            </View>
          </View>

          <Button label="Cipta Ahli" loading={busy} disabled={busy} onPress={() => void submit()} />
        </View>
      </Screen>

      {/*
        Modal ini tidak boleh ditutup dengan mengetuk latar: kata laluan tidak
        boleh dilihat semula, jadi ia perlu ditutup secara sedar.
      */}
      <FormModal
        visible={created !== null}
        title="Ahli Berjaya Dicipta"
        description="Salin kata laluan sementara ini SEKARANG dan hantar kepada ahli. Ia tidak boleh dilihat lagi selepas skrin ini ditutup."
        dismissable={false}
        onClose={() => setCreated(null)}>
        <View className="gap-2">
          <Text className="text-sm font-medium text-ink-muted">Ahli</Text>
          <Text className="text-base font-semibold text-ink">
            {created ? created.nombor_ahli + ' · ' + created.full_name : ''}
          </Text>
          <Text className="text-sm text-ink-muted">{created?.email ?? ''}</Text>
        </View>

        <View className="gap-2">
          <Text className="text-sm font-medium text-ink-muted">Kata laluan sementara</Text>
          <View className="rounded-field border border-line bg-background px-4 py-4">
            <Text selectable className="text-center text-lg font-bold tracking-widest text-ink">
              {created?.password ?? ''}
            </Text>
          </View>
        </View>

        <Notice
          tone="warn"
          message="Kata laluan ini tidak disimpan di mana-mana. Jika hilang, admin perlu menetapkan semula kata laluan ahli."
        />

        <Button
          label={copied ? 'Disalin ✓' : 'Salin Kata Laluan'}
          variant="secondary"
          onPress={() => void copyPassword()}
        />

        <Button label="Saya Sudah Simpan" onPress={() => setCreated(null)} />
      </FormModal>
    </>
  );
}
