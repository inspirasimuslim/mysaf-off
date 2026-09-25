import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CellText, DataTable, RowIconAction } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { FormModal } from '@/components/ui/form-modal';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { ToastBanner } from '@/components/ui/toast';
import {
  createAhliDiputihkan,
  deleteAhliDiputihkan,
  fetchAhliDiputihkan,
  type AhliDiputihkan,
} from '@/lib/ahli-diputihkan';
import { useDepartmentAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { fetchGenerations } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import { useIsDesktop } from '@/lib/use-desktop';
import { ORG_CHART_DEPARTMENT } from '@/lib/org-chart';
import { Colors } from '@/constants/theme';
import { generationLabel, generationOrder, type Generation, type Option } from '@/types/database';

type Banner = { tone: 'positive' | 'negative'; message: string } | null;

/**
 * Senarai Ahli Diputihkan — rekod SEJARAH ahli yang dibuang secara rasmi.
 *
 * Dimiliki oleh department SETIAUSAHA (`ORG_CHART_DEPARTMENT`) — SAMA
 * department yang memiliki Carta Organisasi, bukan JABATAN SETIAUSAHA yang
 * memiliki Program/Pengumuman. Data sensitif: RLS menolak sesiapa selain
 * department ini/Super Admin daripada SELECT langsung — lihat
 * `20260923000058_ahli_diputihkan.sql`.
 */
export default function AhliDiputihkanScreen() {
  const goBack = useGoBack();
  const desktop = useIsDesktop();
  const { loading: accessLoading, canView, canEdit } = useDepartmentAccess(ORG_CHART_DEPARTMENT);

  const [rows, setRows] = useState<AhliDiputihkan[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, gens] = await Promise.all([fetchAhliDiputihkan(), fetchGenerations()]);
      setRows(list);
      setGenerations(gens);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan senarai.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accessLoading || !canView) return;
    void load();
  }, [accessLoading, canView, load]);

  const generationOptions: Option<string>[] = generations
    .slice()
    .sort((a, b) => generationOrder(a.code) - generationOrder(b.code))
    .map((row) => ({ value: row.code, label: row.label }));

  const needle = search.trim().toLowerCase();
  const filtered = needle
    ? rows.filter((row) => row.nama.toLowerCase().includes(needle) || String(row.tahun_dibuang).includes(needle))
    : rows;

  // --- Tambah rekod -----------------------------------------------------------
  const [addOpen, setAddOpen] = useState(false);
  const [nama, setNama] = useState('');
  const [generasi, setGenerasi] = useState<string | null>(null);
  const [tahun, setTahun] = useState(String(new Date().getFullYear()));
  const [catatan, setCatatan] = useState('');
  const [saving, setSaving] = useState(false);

  const openAdd = useCallback(() => {
    setNama('');
    setGenerasi(null);
    setTahun(String(new Date().getFullYear()));
    setCatatan('');
    setAddOpen(true);
  }, []);

  const parsedTahun = Number.parseInt(tahun, 10);
  const tahunValid = Number.isFinite(parsedTahun) && parsedTahun >= 2000 && parsedTahun <= 2100;
  const addReady = nama.trim().length > 0 && Boolean(generasi) && tahunValid;

  const submitAdd = useCallback(async () => {
    if (!addReady || saving) return;

    setSaving(true);
    try {
      await createAhliDiputihkan({
        nama: nama.trim(),
        generasi: generasi!,
        tahun_dibuang: parsedTahun,
        catatan: catatan.trim() || null,
      });
      setAddOpen(false);
      setBanner({ tone: 'positive', message: 'Rekod berjaya ditambah.' });
      await load();
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menambah rekod.') });
    } finally {
      setSaving(false);
    }
  }, [addReady, catatan, generasi, load, nama, parsedTahun, saving]);

  // --- Padam rekod --------------------------------------------------------------
  const [pendingDelete, setPendingDelete] = useState<AhliDiputihkan | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete || deleteBusy) return;

    setDeleteBusy(true);
    try {
      await deleteAhliDiputihkan(pendingDelete.id);
      setRows((current) => current.filter((row) => row.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memadam rekod.') });
      setPendingDelete(null);
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteBusy, pendingDelete]);

  if (accessLoading) return <LoadingScreen />;

  if (!canView) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Ahli Diputihkan" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Senarai ini memerlukan kebenaran pada department SETIAUSAHA."
          />
        </View>
      </Screen>
    );
  }

  if (loading) return <LoadingScreen />;

  return (
    <>
      <Screen padTop={false} wide>
        <ScreenHeader
          eyebrow="Panel Admin"
          title="Ahli Diputihkan"
          subtitle="Rekod sejarah ahli yang dibuang secara rasmi"
          onBackPress={goBack}
        />

        <View className="gap-4 px-gutter pt-5 pb-8">
          {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

          {!canEdit ? (
            <Notice tone="info" message="Anda hanya mempunyai akses Lihat. Senarai di bawah adalah paparan sahaja." />
          ) : (
            <Button label="+ Tambah Rekod" onPress={openAdd} />
          )}

          {rows.length > 5 ? (
            <TextField
              label="Cari"
              placeholder="Nama atau tahun"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : null}

          {rows.length === 0 ? (
            <EmptyState
              icon="person-remove-outline"
              title="Tiada rekod"
              description="Belum ada ahli diputihkan direkodkan."
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="search-outline"
              title="Tiada padanan"
              description="Tiada rekod sepadan dengan carian ini."
            />
          ) : (
            <View>
              <SectionTitle title={'Rekod (' + filtered.length + ')'} />
              {desktop ? (
                <DataTable
                  rows={filtered}
                  keyOf={(r) => r.id}
                  actionsWidth={56}
                  columns={[
                    { key: 'nama', header: 'Nama', flex: 2, render: (r) => <CellText strong>{r.nama}</CellText> },
                    { key: 'gen', header: 'Generasi', flex: 1, render: (r) => <CellText muted>{generationLabel(r.generasi)}</CellText> },
                    { key: 'tahun', header: 'Tahun Dibuang', width: 130, render: (r) => <CellText>{String(r.tahun_dibuang)}</CellText> },
                    { key: 'catatan', header: 'Catatan', flex: 2, render: (r) => <CellText muted>{r.catatan ?? '—'}</CellText> },
                  ]}
                  actions={(r) =>
                    canEdit ? (
                      <RowIconAction
                        icon="trash-outline"
                        destructive
                        label={'Padam rekod ' + r.nama}
                        onPress={() => setPendingDelete(r)}
                      />
                    ) : null
                  }
                />
              ) : (
              <View className="gap-2.5">
                {filtered.map((row) => (
                  <View
                    key={row.id}
                    className="flex-row items-center gap-3 rounded-field bg-surface px-4 py-3">
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-ink" numberOfLines={1}>
                        {row.nama}
                      </Text>
                      <Text className="mt-0.5 text-xs text-ink-muted" numberOfLines={1}>
                        {generationLabel(row.generasi) + ' · Dibuang ' + row.tahun_dibuang}
                        {row.catatan ? ' · ' + row.catatan : ''}
                      </Text>
                    </View>

                    {canEdit ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={'Padam rekod ' + row.nama}
                        hitSlop={8}
                        onPress={() => setPendingDelete(row)}
                        className="h-8 w-8 items-center justify-center rounded-pill active:opacity-70">
                        <Ionicons name="trash-outline" size={16} color={Colors.negative} />
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
              )}
            </View>
          )}
        </View>
      </Screen>

      <FormModal
        visible={addOpen}
        title="Tambah Rekod"
        description="Ringkas sahaja — nama, generasi dan tahun dibuang. Tiada perlu sebab terperinci."
        dismissable={!saving}
        onClose={() => setAddOpen(false)}>
        <TextField
          label="Nama"
          value={nama}
          onChangeText={setNama}
          editable={!saving}
          autoCapitalize="characters"
          autoCorrect={false}
        />

        <PickerField
          label="Generasi"
          value={generasi}
          options={generationOptions}
          onChange={setGenerasi}
          disabled={saving}
          clearable={false}
        />

        <TextField
          label="Tahun dibuang"
          value={tahun}
          onChangeText={(value) => setTahun(value.replace(/[^\d]/g, '').slice(0, 4))}
          editable={!saving}
          keyboardType="number-pad"
          error={tahun.length > 0 && !tahunValid ? 'Antara 2000 dan 2100.' : null}
        />

        <TextField
          label="Catatan (opsyenal)"
          value={catatan}
          onChangeText={setCatatan}
          editable={!saving}
          autoCapitalize="sentences"
          autoCorrect={false}
        />

        <Button label="Tambah Rekod" loading={saving} disabled={saving || !addReady} onPress={() => void submitAdd()} />
      </FormModal>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title="Padam rekod ini?"
        message={
          'Padam rekod "' +
          (pendingDelete?.nama ?? '') +
          '" secara kekal? Tindakan ini tidak boleh diundur.'
        }
        confirmLabel="Padam"
        destructive
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
