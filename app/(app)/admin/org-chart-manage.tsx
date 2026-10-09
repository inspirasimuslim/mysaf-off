import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
import { OrgPositionRow } from '@/components/org-position-row';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormModal } from '@/components/ui/form-modal';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { ToastBanner } from '@/components/ui/toast';
import { useDepartmentAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import {
  ORG_CHART_DEPARTMENT,
  addOrgPosition,
  deleteOrgPosition,
  deleteOrgSection,
  fetchOrgChart,
  fetchOrgMemberOptions,
  flattenOrgChart,
  groupOrgChart,
  reorderOrgChart,
  setOrgPositionMember,
  swapAt,
  type OrgMemberOption,
  type OrgPosition,
  type OrgSection,
} from '@/lib/org-chart';
import { useColors } from '@/lib/theme';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

/** `bahagian: null` = bahagian baharu (nama bahagian dan jawatan pertamanya). */
type FormTarget = { mode: 'change'; position: OrgPosition } | { mode: 'add'; bahagian: string | null };

type PendingDelete = { kind: 'position'; position: OrgPosition } | { kind: 'section'; section: OrgSection };

const SEARCH_LIMIT = 20;

/** Ruang putih berganda → satu, supaya 'Timbalan  Rais' tidak menjadi jawatan kedua. */
function cleanLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Pemilih ahli sebaris dalam helaian borang — bukan modal kedua, kerana modal
 * bertindih modal tidak dipapar dengan betul di iOS.
 */
function MemberSearch({
  options,
  selectedId,
  onSelect,
  disabled,
}: {
  options: OrgMemberOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  disabled: boolean;
}) {
  const [term, setTerm] = useState('');

  const matches = useMemo(() => {
    const value = term.trim().toLowerCase();
    if (!value) return [];
    return options.filter((option) => option.full_name.toLowerCase().includes(value)).slice(0, SEARCH_LIMIT);
  }, [options, term]);

  const selected = options.find((option) => option.id === selectedId) ?? null;

  return (
    <View className="gap-3">
      {selected ? (
        <View className="flex-row items-center gap-3 rounded-field border border-primary bg-surface p-3">
          <MemberAvatar fullName={selected.full_name} avatarUrl={selected.avatar_url} size={36} />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-ink" numberOfLines={2}>
              {selected.full_name}
            </Text>
            {selected.generasi ? <Text className="text-xs text-ink-muted">{'Generasi ' + selected.generasi}</Text> : null}
          </View>
          <IconButton
            icon="close"
            accessibilityLabel="Buang pilihan ahli"
            disabled={disabled}
            onPress={() => onSelect(null)}
          />
        </View>
      ) : (
        <Text className="text-sm text-ink-muted">Tiada ahli dipilih — jawatan akan dibiarkan kosong.</Text>
      )}

      <TextField
        label="Cari ahli"
        placeholder="Taip sebahagian nama"
        value={term}
        onChangeText={setTerm}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        topAnchored
      />

      {term.trim() ? (
        matches.length ? (
          <View className="gap-2">
            {matches.map((option) => (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityLabel={'Pilih ' + option.full_name}
                disabled={disabled}
                onPress={() => {
                  onSelect(option.id);
                  setTerm('');
                }}
                className={`flex-row items-center gap-3 rounded-field border bg-surface p-3 active:opacity-70 ${
                  option.id === selectedId ? 'border-primary' : 'border-line'
                }`}>
                <MemberAvatar fullName={option.full_name} avatarUrl={option.avatar_url} size={32} />
                <Text className="flex-1 text-sm text-ink" numberOfLines={2}>
                  {option.full_name}
                </Text>
                {option.generasi ? <Text className="text-xs text-ink-faint">{option.generasi}</Text> : null}
              </Pressable>
            ))}
          </View>
        ) : (
          <Text className="text-sm text-ink-muted">Tiada nama sepadan.</Text>
        )
      ) : null}
    </View>
  );
}

/**
 * Urus Carta Organisasi — department SETIAUSAHA (can_edit) dan Super Admin.
 *
 * BUKAN JABATAN SETIAUSAHA: itu department lain yang memiliki Program dan
 * Pengumuman. Susunan guna butang naik/turun dan bukan seret — tiada library
 * drag-to-reorder dalam app, dan butang lebih tepat pada skrin kecil.
 *
 * Kawalan UI sahaja; RLS `org_positions` tetap penentu muktamad.
 */
export default function OrgChartManageScreen() {
  const colors = useColors();
  const goBack = useGoBack();
  const access = useDepartmentAccess(ORG_CHART_DEPARTMENT);

  const [rows, setRows] = useState<OrgPosition[]>([]);
  const [options, setOptions] = useState<OrgMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);
  const [moving, setMoving] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await fetchOrgChart());
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan carta organisasi.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access.loading || !access.canEdit) return;
    void load();
    void (async () => {
      try {
        setOptions(await fetchOrgMemberOptions());
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan senarai ahli.') });
      }
    })();
  }, [access.loading, access.canEdit, load]);

  const sections = useMemo(() => groupOrgChart(rows), [rows]);

  // --- Susun semula ---------------------------------------------------------
  /*
    Seluruh jujukan dihantar dan dinomborkan semula di pelayan. Kemas kini
    optimistik supaya baris bergerak serta-merta; bila gagal, carta dibaca
    semula dari pelayan.
  */
  const applyOrder = useCallback(
    async (next: OrgSection[]) => {
      if (moving) return;
      const ids = flattenOrgChart(next);
      const orderById = new Map(ids.map((id, index) => [id, index + 1]));

      setBanner(null);
      setMoving(true);
      setRows((current) =>
        current.map((row) => ({ ...row, display_order: orderById.get(row.id) ?? row.display_order })),
      );

      try {
        await reorderOrgChart(ids);
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menyusun semula carta.') });
        await load();
      } finally {
        setMoving(false);
      }
    },
    [load, moving],
  );

  const moveSection = (index: number, direction: -1 | 1) => void applyOrder(swapAt(sections, index, direction));

  const movePosition = (sectionIndex: number, positionIndex: number, direction: -1 | 1) =>
    void applyOrder(
      sections.map((section, index) =>
        index === sectionIndex ? { ...section, positions: swapAt(section.positions, positionIndex, direction) } : section,
      ),
    );

  // --- Borang tambah / tukar ------------------------------------------------
  const [form, setForm] = useState<FormTarget | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [bahagianInput, setBahagianInput] = useState('');
  const [jawatanInput, setJawatanInput] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);

  const openForm = useCallback((target: FormTarget) => {
    setBanner(null);
    setBahagianInput('');
    setJawatanInput('');
    setMemberId(target.mode === 'change' ? target.position.member_id : null);
    setFormError(null);
    setFormBusy(false);
    setFormKey((key) => key + 1);
    setForm(target);
  }, []);

  const saveChange = useCallback(
    async (position: OrgPosition, next: string | null) => {
      if (formBusy) return;
      setFormBusy(true);
      try {
        await setOrgPositionMember(position.id, next);
        setForm(null);
        await load();
        setBanner({
          tone: 'positive',
          message: next ? position.jawatan + ' telah dikemas kini.' : position.jawatan + ' telah dikosongkan.',
        });
      } catch (caught) {
        setFormError(toMalayError(caught, 'Gagal mengemas kini jawatan.'));
      } finally {
        setFormBusy(false);
      }
    },
    [formBusy, load],
  );

  const submitAdd = useCallback(async () => {
    if (!form || form.mode !== 'add' || formBusy) return;

    const bahagian = form.bahagian ?? cleanLabel(bahagianInput);
    const jawatan = cleanLabel(jawatanInput);

    if (!bahagian) {
      setFormError('Sila masukkan nama bahagian.');
      return;
    }
    if (form.bahagian === null && sections.some((s) => s.bahagian.toLowerCase() === bahagian.toLowerCase())) {
      setFormError('Bahagian ini sudah wujud. Guna "Tambah Jawatan" dalam bahagian itu.');
      return;
    }
    if (!jawatan) {
      setFormError('Sila masukkan nama jawatan.');
      return;
    }
    const existing = sections.find((s) => s.bahagian === bahagian);
    if (existing?.positions.some((p) => p.jawatan.toLowerCase() === jawatan.toLowerCase())) {
      setFormError('Jawatan ini sudah ada dalam bahagian ' + bahagian + '.');
      return;
    }

    setFormBusy(true);
    try {
      await addOrgPosition(bahagian, jawatan, memberId);
      setForm(null);
      await load();
      setBanner({
        tone: 'positive',
        message: form.bahagian === null ? 'Bahagian ' + bahagian + ' telah ditambah.' : jawatan + ' telah ditambah.',
      });
    } catch (caught) {
      setFormError(toMalayError(caught, 'Gagal menambah jawatan.'));
    } finally {
      setFormBusy(false);
    }
  }, [bahagianInput, form, formBusy, jawatanInput, load, memberId, sections]);

  // --- Padam ----------------------------------------------------------------
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const confirmDelete = useCallback(async () => {
    if (!pending || deleteBusy) return;
    setDeleteBusy(true);
    try {
      if (pending.kind === 'position') {
        await deleteOrgPosition(pending.position.id);
        setBanner({ tone: 'positive', message: pending.position.jawatan + ' telah dipadam dari carta.' });
      } else {
        await deleteOrgSection(pending.section.bahagian);
        setBanner({ tone: 'positive', message: 'Bahagian ' + pending.section.bahagian + ' telah dipadam.' });
      }
      setPending(null);
      await load();
    } catch (caught) {
      setPending(null);
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memadam.') });
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteBusy, load, pending]);

  if (access.loading) return <LoadingScreen />;
  if (!access.canEdit) {
    return (
      <NoAccessScreen
        title="Carta Organisasi"
        description="Mengurus carta organisasi memerlukan kebenaran menyunting pada department SETIAUSAHA."
      />
    );
  }
  if (loading) return <LoadingScreen />;

  const vacant = rows.filter((row) => !row.member_id).length;

  const pendingMessage = !pending
    ? ''
    : pending.kind === 'position'
      ? 'Jawatan "' +
        pending.position.jawatan +
        '" dalam ' +
        pending.position.bahagian +
        ' akan dibuang terus dari struktur carta — bukan sekadar dikosongkan.'
      : 'Bahagian ' +
        pending.section.bahagian +
        ' masih mempunyai ' +
        pending.section.positions.length +
        ' jawatan (' +
        pending.section.positions.map((p) => p.jawatan).join(', ') +
        '). Kesemuanya akan dipadam sekali bersama bahagian ini.';

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader
          eyebrow="Setiausaha"
          title="Urus Carta Organisasi"
          subtitle={
            sections.length + ' bahagian · ' + rows.length + ' jawatan' + (vacant ? ' · ' + vacant + ' kosong' : '')
          }
          onBackPress={goBack}
        />

        <View className="gap-4 px-gutter pb-8 pt-5">
          {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

          <Button
            label="Tambah Bahagian Baharu"
            icon={<Ionicons name="add" size={18} color={colors.white} />}
            onPress={() => openForm({ mode: 'add', bahagian: null })}
          />

          <Text className="text-sm leading-5 text-ink-muted">
            Anak panah menyusun bahagian dan jawatan. Setiap perubahan terus dipapar kepada semua ahli.
          </Text>

          {sections.length === 0 ? (
            <EmptyState
              icon="git-network-outline"
              title="Carta masih kosong"
              description="Tambah bahagian pertama beserta jawatannya."
            />
          ) : null}

          {sections.map((section, sectionIndex) => (
            <View key={section.bahagian} className="overflow-hidden rounded-card border border-line bg-surface">
              <View className="flex-row items-center gap-2 border-b border-line bg-primary-soft py-2 pl-4 pr-2">
                <View className="flex-1">
                  <Text className="text-base font-bold text-ink">{section.bahagian}</Text>
                  <Text className="text-xs text-ink-muted">{section.positions.length + ' jawatan'}</Text>
                </View>
                <IconButton
                  icon="arrow-up"
                  accessibilityLabel={'Naikkan bahagian ' + section.bahagian}
                  disabled={moving || sectionIndex === 0}
                  onPress={() => moveSection(sectionIndex, -1)}
                />
                <IconButton
                  icon="arrow-down"
                  accessibilityLabel={'Turunkan bahagian ' + section.bahagian}
                  disabled={moving || sectionIndex === sections.length - 1}
                  onPress={() => moveSection(sectionIndex, 1)}
                />
                <IconButton
                  icon="trash-outline"
                  tone="danger"
                  accessibilityLabel={'Padam bahagian ' + section.bahagian}
                  onPress={() => setPending({ kind: 'section', section })}
                />
              </View>

              {section.positions.map((position, positionIndex) => (
                <View key={position.id} className="gap-3 border-b border-line p-4">
                  <OrgPositionRow position={position} />

                  <View className="flex-row items-center gap-2">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={'Tukar pemegang ' + position.jawatan}
                      onPress={() => openForm({ mode: 'change', position })}
                      className="h-10 flex-row items-center gap-1.5 rounded-pill border border-line bg-surface px-4 active:opacity-70">
                      <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
                      <Text className="text-sm font-semibold text-ink">Tukar</Text>
                    </Pressable>

                    <View className="flex-1" />

                    <IconButton
                      icon="arrow-up"
                      accessibilityLabel={'Naikkan ' + position.jawatan}
                      disabled={moving || positionIndex === 0}
                      onPress={() => movePosition(sectionIndex, positionIndex, -1)}
                    />
                    <IconButton
                      icon="arrow-down"
                      accessibilityLabel={'Turunkan ' + position.jawatan}
                      disabled={moving || positionIndex === section.positions.length - 1}
                      onPress={() => movePosition(sectionIndex, positionIndex, 1)}
                    />
                    <IconButton
                      icon="trash-outline"
                      tone="danger"
                      accessibilityLabel={'Padam ' + position.jawatan}
                      onPress={() => setPending({ kind: 'position', position })}
                    />
                  </View>
                </View>
              ))}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'Tambah jawatan dalam ' + section.bahagian}
                onPress={() => openForm({ mode: 'add', bahagian: section.bahagian })}
                className="flex-row items-center justify-center gap-2 p-4 active:opacity-70">
                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                <Text className="text-sm font-semibold text-primary">Tambah Jawatan</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </Screen>

      <FormModal
        visible={form !== null}
        title={
          form?.mode === 'change'
            ? 'Tukar ' + form.position.jawatan
            : form?.bahagian
              ? 'Tambah Jawatan'
              : 'Tambah Bahagian Baharu'
        }
        description={
          form?.mode === 'change'
            ? form.position.bahagian + '. Pilih ahli baharu, atau kosongkan jawatan ini.'
            : form?.bahagian
              ? 'Dalam ' + form.bahagian + '. Jawatan baharu diletakkan di hujung bahagian.'
              : 'Setiap bahagian perlukan sekurang-kurangnya satu jawatan — masukkan jawatan pertamanya sekali.'
        }
        dismissable={!formBusy}
        onClose={() => setForm(null)}
        footer={
          form?.mode === 'change' ? (
            <View className="gap-3">
              <Button
                label="Simpan"
                loading={formBusy}
                disabled={formBusy || !memberId || memberId === form.position.member_id}
                onPress={() => void saveChange(form.position, memberId)}
              />
              {form.position.member_id ? (
                <Button
                  label="Kosongkan Jawatan"
                  variant="danger"
                  disabled={formBusy}
                  onPress={() => void saveChange(form.position, null)}
                />
              ) : null}
            </View>
          ) : (
            <Button label="Simpan" loading={formBusy} disabled={formBusy} onPress={() => void submitAdd()} />
          )
        }>
        {formError ? <Notice tone="negative" message={formError} /> : null}

        {form?.mode === 'add' && form.bahagian === null ? (
          <TextField
            label="Nama bahagian"
            placeholder="Contoh: Lajnah Dakwah (LD)"
            value={bahagianInput}
            onChangeText={setBahagianInput}
            autoCapitalize="words"
            editable={!formBusy}
          />
        ) : null}

        {form?.mode === 'add' ? (
          <TextField
            label={form.bahagian === null ? 'Jawatan pertama' : 'Nama jawatan'}
            placeholder="Contoh: Rais"
            value={jawatanInput}
            onChangeText={setJawatanInput}
            autoCapitalize="words"
            editable={!formBusy}
          />
        ) : null}

        <MemberSearch
          key={formKey}
          options={options}
          selectedId={memberId}
          onSelect={setMemberId}
          disabled={formBusy}
        />
      </FormModal>

      <ConfirmDialog
        visible={pending !== null}
        title={pending?.kind === 'section' ? 'Padam bahagian?' : 'Padam jawatan?'}
        message={pendingMessage}
        confirmLabel={
          pending?.kind === 'section'
            ? 'Padam Bahagian & ' + pending.section.positions.length + ' Jawatan'
            : 'Padam Jawatan'
        }
        destructive
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
