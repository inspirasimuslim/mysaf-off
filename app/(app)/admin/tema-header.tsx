import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Switch, Text, View } from 'react-native';

import { NoAccessScreen, SUPER_ADMIN_ONLY } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormModal } from '@/components/ui/form-modal';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { OptionalDateField } from '@/components/ui/optional-date-field';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { Segmented } from '@/components/ui/segmented';
import { TextField } from '@/components/ui/text-field';
import { ToastBanner } from '@/components/ui/toast';
import { toMalayError } from '@/lib/errors';
import {
  deleteHeaderTheme,
  fetchAllHeaderThemes,
  saveHeaderTheme,
  THEME_SPEC,
  themeImageUrl,
  type HeaderThemeRow,
} from '@/lib/header-theme';
import { pickImage } from '@/lib/image-upload';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/permissions';
import { useColors } from '@/lib/theme';

type Banner = { tone: 'positive' | 'negative'; message: string } | null;
type Jenis = 'perayaan' | 'hari_jadi';

function tarikhLabel(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}/${y}`;
}

/**
 * Tema Header (migration 158) — Super Admin memuat naik latar PNG/WebP untuk header Utama
 * dan menetapkan tarikh perayaan satu per satu. Tema hari jadi (satu sahaja) mengatasi perayaan.
 */
export default function TemaHeaderScreen() {
  const colors = useColors();
  const goBack = useGoBack();
  const { isSuperAdmin } = usePermissions();

  const [rows, setRows] = useState<HeaderThemeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Borang: `formKey` memasang semula badan borang pada setiap bukaan (tiada set-state dalam effect).
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<HeaderThemeRow | null>(null);

  const [pendingDelete, setPendingDelete] = useState<HeaderThemeRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await fetchAllHeaderThemes());
      setBanner(null);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan tema.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openForm = (row: HeaderThemeRow | null) => {
    setBanner(null);
    setEditing(row);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  };

  const toggle = async (row: HeaderThemeRow, next: boolean) => {
    setTogglingId(row.id);
    try {
      await saveHeaderTheme(row, { nama: row.nama, jenis: row.jenis, mula: row.mula, tamat: row.tamat, aktif: next });
      await load();
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menukar status.') });
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await deleteHeaderTheme(pendingDelete);
      setBanner({ tone: 'positive', message: pendingDelete.nama + ' telah dipadam.' });
      setPendingDelete(null);
      await load();
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memadam tema.') });
      setPendingDelete(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  if (loading) return <LoadingScreen />;
  if (!isSuperAdmin()) return <NoAccessScreen title="Panel Super Admin" description={SUPER_ADMIN_ONLY} />;

  const hasHariJadi = rows.some((row) => row.jenis === 'hari_jadi');

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader eyebrow="Panel Super Admin" title="Tema Header" subtitle={rows.length + ' tema'} onBackPress={goBack} />

        <View className="gap-5 px-gutter pb-10 pt-5">
          {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

          <Notice
            tone="info"
            message={
              `Muat naik PNG/WebP (maks 2 MB). Mobile ${THEME_SPEC.mobile.width}×${THEME_SPEC.mobile.height}px, ` +
              `desktop ${THEME_SPEC.desktop.width}×${THEME_SPEC.desktop.height}px (pilihan — jika tiada, imej mobile dipakai). ` +
              'Biarkan kawasan kiri (avatar + nama) dan kanan-atas (ikon) tidak sibuk. Tema hari jadi mengatasi perayaan pada hari lahir ahli itu sendiri.'
            }
          />

          <Button label="Tambah Tema" onPress={() => openForm(null)} />

          {rows.length === 0 ? (
            <EmptyState icon="color-palette-outline" title="Tiada tema" description="Tambah tema pertama untuk perayaan atau hari jadi." />
          ) : (
            <View>
              <SectionTitle title="Senarai Tema" caption="Tema perayaan dipaparkan hanya dalam julat tarikhnya (waktu Malaysia)." />
              <View className="gap-2">
                {rows.map((row) => (
                  <View key={row.id} className="gap-2 rounded-card border border-line bg-surface p-3">
                    <Image
                      source={{ uri: themeImageUrl(row.image_mobile) }}
                      contentFit="cover"
                      style={{ width: '100%', aspectRatio: THEME_SPEC.mobile.width / THEME_SPEC.mobile.height, borderRadius: 12, backgroundColor: colors.primary }}
                    />
                    <View className="flex-row items-center gap-2">
                      <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={1}>
                        {row.nama}
                      </Text>
                      <Badge label={row.jenis === 'hari_jadi' ? 'Hari jadi' : 'Perayaan'} tone="neutral" />
                    </View>
                    {row.jenis === 'perayaan' ? (
                      <Text className="text-sm text-ink-muted">{tarikhLabel(row.mula) + ' – ' + tarikhLabel(row.tamat)}</Text>
                    ) : (
                      <Text className="text-sm text-ink-muted">Hari lahir setiap ahli (ikut NRIC)</Text>
                    )}
                    {!row.image_desktop ? <Text className="text-xs text-ink-muted">Tiada imej desktop — imej mobile dipakai.</Text> : null}
                    <View className="flex-row items-center gap-3">
                      <Switch
                        value={row.aktif}
                        onValueChange={(next) => void toggle(row, next)}
                        disabled={togglingId === row.id}
                        trackColor={{ false: colors.line, true: colors.primaryMid }}
                        thumbColor={colors.white}
                        ios_backgroundColor={colors.line}
                        accessibilityLabel={'Status aktif ' + row.nama}
                      />
                      <Text className="flex-1 text-sm text-ink-muted">{row.aktif ? 'Aktif' : 'Nonaktif'}</Text>
                      <IconButton icon="pencil-outline" accessibilityLabel={'Sunting ' + row.nama} onPress={() => openForm(row)} />
                      <IconButton icon="trash-outline" tone="danger" accessibilityLabel={'Padam ' + row.nama} onPress={() => setPendingDelete(row)} />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </Screen>

      <FormModal
        visible={formOpen}
        title={editing ? 'Sunting Tema' : 'Tambah Tema'}
        dismissable
        onClose={() => setFormOpen(false)}>
        <ThemeForm
          key={formKey}
          editing={editing}
          hasHariJadi={hasHariJadi}
          onDone={async (message) => {
            setFormOpen(false);
            setBanner({ tone: 'positive', message });
            await load();
          }}
        />
      </FormModal>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title="Padam tema?"
        message={'Padam ' + (pendingDelete?.nama ?? '') + ' beserta imejnya? Tindakan ini tidak boleh dibuat asal.'}
        confirmLabel="Padam"
        destructive
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

function ThemeForm({
  editing,
  hasHariJadi,
  onDone,
}: {
  editing: HeaderThemeRow | null;
  hasHariJadi: boolean;
  onDone: (message: string) => Promise<void>;
}) {
  const [nama, setNama] = useState(editing?.nama ?? '');
  const [jenis, setJenis] = useState<Jenis>(editing?.jenis ?? 'perayaan');
  const [mula, setMula] = useState(editing?.mula ?? '');
  const [tamat, setTamat] = useState(editing?.tamat ?? '');
  const [aktif, setAktif] = useState(editing?.aktif ?? true);
  const [mobileUri, setMobileUri] = useState<string | null>(null);
  const [desktopUri, setDesktopUri] = useState<string | null>(null);
  const [clearDesktop, setClearDesktop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (set: (uri: string | null) => void) => {
    try {
      const uri = await pickImage();
      if (uri) set(uri);
    } catch (caught) {
      setError(toMalayError(caught, 'Gagal memilih gambar.'));
    }
  };

  const submit = async () => {
    if (busy) return;
    if (nama.trim().length < 2) return setError('Sila masukkan nama tema (sekurang-kurangnya 2 aksara).');
    if (jenis === 'perayaan') {
      if (!mula || !tamat) return setError('Sila tetapkan tarikh mula dan tamat.');
      if (tamat < mula) return setError('Tarikh tamat mesti sama atau selepas tarikh mula.');
    }
    if (jenis === 'hari_jadi' && hasHariJadi && editing?.jenis !== 'hari_jadi') {
      return setError('Tema hari jadi sudah wujud. Sunting yang sedia ada.');
    }
    if (!editing && !mobileUri) return setError('Sila pilih imej mobile.');

    setBusy(true);
    setError(null);
    try {
      await saveHeaderTheme(editing, {
        nama,
        jenis,
        mula: mula || null,
        tamat: tamat || null,
        aktif,
        mobileUri,
        desktopUri,
        clearDesktop: clearDesktop && !desktopUri,
      });
      await onDone(nama.trim() + ' disimpan.');
    } catch (caught) {
      setError(toMalayError(caught, 'Gagal menyimpan tema.'));
      setBusy(false);
    }
  };

  return (
    <View className="gap-4">
      {error ? <Notice tone="negative" message={error} /> : null}
      <TextField label="Nama tema" placeholder="Contoh: Hari Raya Aidilfitri" value={nama} onChangeText={setNama} editable={!busy} />
      <Segmented<Jenis>
        label="Jenis"
        value={jenis}
        options={[
          { value: 'perayaan', label: 'Perayaan' },
          { value: 'hari_jadi', label: 'Hari jadi' },
        ]}
        onChange={setJenis}
        disabled={busy}
      />
      {jenis === 'perayaan' ? (
        <>
          <OptionalDateField label="Tarikh mula" value={mula} onChange={setMula} disabled={busy} />
          <OptionalDateField label="Tarikh tamat" value={tamat} onChange={setTamat} disabled={busy} />
        </>
      ) : null}

      <View className="gap-2">
        <Text className="text-sm font-medium text-ink-muted">
          {`Imej mobile (${THEME_SPEC.mobile.width}×${THEME_SPEC.mobile.height}px)`}
        </Text>
        <Text className="text-xs text-ink-muted">
          {mobileUri ? 'Imej baharu dipilih.' : editing ? 'Imej sedia ada dikekalkan.' : 'Belum dipilih.'}
        </Text>
        <Button label={mobileUri || editing ? 'Tukar Imej Mobile' : 'Pilih Imej Mobile'} variant="secondary" size="sm" onPress={() => void pick(setMobileUri)} disabled={busy} />
      </View>

      <View className="gap-2">
        <Text className="text-sm font-medium text-ink-muted">
          {`Imej desktop (${THEME_SPEC.desktop.width}×${THEME_SPEC.desktop.height}px, pilihan)`}
        </Text>
        <Text className="text-xs text-ink-muted">
          {desktopUri ? 'Imej baharu dipilih.' : editing?.image_desktop && !clearDesktop ? 'Imej sedia ada dikekalkan.' : 'Tiada — imej mobile dipakai.'}
        </Text>
        <Button label="Pilih Imej Desktop" variant="secondary" size="sm" onPress={() => void pick(setDesktopUri)} disabled={busy} />
        {editing?.image_desktop && !desktopUri && !clearDesktop ? (
          <Button label="Buang Imej Desktop" variant="secondary" size="sm" onPress={() => setClearDesktop(true)} disabled={busy} />
        ) : null}
      </View>

      <View className="flex-row items-center justify-between">
        <Text className="text-base text-ink">Aktif</Text>
        <Switch value={aktif} onValueChange={setAktif} disabled={busy} />
      </View>

      <Button label="Simpan Tema" loading={busy} disabled={busy} onPress={() => void submit()} />
    </View>
  );
}
