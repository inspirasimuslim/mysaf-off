import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { Segmented } from '@/components/ui/segmented';
import { SelectRow } from '@/components/ui/select-row';
import { TextField } from '@/components/ui/text-field';
import { ToastBanner } from '@/components/ui/toast';
import { useYuranAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { fetchGenerations } from '@/lib/members';
import {
  YURAN_PER_MEMBER,
  cancelGroupPayment,
  createGroupPayment,
  fetchGroupCandidates,
  fetchGroupPaymentHistory,
  fetchGroupPaymentMembers,
  ringgit,
  type GroupCandidate,
  type GroupPaymentBatch,
  type GroupPaymentMember,
} from '@/lib/yuran';
import { generationLabel, type Generation } from '@/types/database';

/**
 * Bayaran Yuran Kumpulan ikut Generasi — modul BENDAHARI.
 *
 * Skrin ini hanya mengumpul pilihan; pelayan (`create_yuran_group_payment`)
 * memecahkan jumlah, mengesahkan semula setiap ahli (aktif, dalam generasi itu)
 * dan menulis batch + semua bayaran dalam SATU transaksi. Pembatalan
 * (`cancel_yuran_group_payment`) juga atomik.
 */

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;
type Tab = 'baharu' | 'sejarah';

/** '30', '30.5', '30,50' → nombor dengan dua tempat perpuluhan; `null` jika tidak sah. */
function parseAmount(value: string): number | null {
  const normalised = value.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) return null;
  const parsed = Number.parseFloat(normalised);
  return parsed > 0 ? Math.round(parsed * 100) / 100 : null;
}

function statusText(row: GroupCandidate, year: number): string {
  if (row.caj_tahun === null) return 'Tiada caj ' + year + ' · dibayar ' + ringgit(row.bayar_tahun);
  const baki = Math.round((row.caj_tahun - row.bayar_tahun) * 100) / 100;
  if (baki > 0) return 'Tunggakan ' + ringgit(baki);
  if (baki < 0) return 'Lunas · kredit ' + ringgit(-baki);
  return 'Lunas';
}

/** Pecahan jumlah kepada sen, sama seperti pelayan: asas + RM0.01 kepada ahli pertama. */
function splitPreview(total: number, count: number): { base: number; extra: number } {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  return { base: base / 100, extra: cents - base * count };
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return pad(date.getDate()) + '/' + pad(date.getMonth() + 1) + '/' + date.getFullYear();
}

export default function YuranGroupPaymentScreen() {
  const goBack = useGoBack();
  const { loading: accessLoading, canView, canEdit } = useYuranAccess();

  const [tab, setTab] = useState<Tab>('baharu');
  const [banner, setBanner] = useState<Banner>(null);

  // --- Borang baharu -------------------------------------------------------------
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [generasi, setGenerasi] = useState<string | null>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [candidates, setCandidates] = useState<GroupCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** `null` = jumlah AUTO (bilangan dipilih × RM30); selain itu laras manual. */
  const [totalOverride, setTotalOverride] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const parsedYear = Number.parseInt(year, 10);
  const yearValid = Number.isFinite(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100;

  useEffect(() => {
    if (accessLoading || !canEdit) return;
    void fetchGenerations()
      .then(setGenerations)
      .catch((caught) => setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan senarai generasi.') }));
  }, [accessLoading, canEdit]);

  useEffect(() => {
    if (!generasi || !yearValid || !canEdit) {
      setCandidates([]);
      setSelected(new Set());
      return;
    }

    let active = true;
    setCandidatesLoading(true);
    void fetchGroupCandidates(generasi, parsedYear)
      .then((rows) => {
        if (!active) return;
        setCandidates(rows);
        // DEFAULT SEMUA dipilih — walaupun sudah lunas (jadi kredit); admin bebas nyah-pilih.
        setSelected(new Set(rows.map((row) => row.member_id)));
        setTotalOverride(null);
      })
      .catch((caught) => {
        if (active) setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan senarai ahli.') });
      })
      .finally(() => {
        if (active) setCandidatesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canEdit, generasi, parsedYear, yearValid]);

  const selectedCount = selected.size;
  const autoTotal = selectedCount * YURAN_PER_MEMBER;
  const total = totalOverride === null ? (autoTotal > 0 ? autoTotal : null) : parseAmount(totalOverride);
  const totalError = totalOverride !== null && total === null ? 'Masukkan jumlah lebih daripada RM0 (contoh: 90 atau 90.50).' : null;
  const split = total !== null && selectedCount > 0 ? splitPreview(total, selectedCount) : null;
  const canSubmit = generasi !== null && yearValid && selectedCount > 0 && total !== null && !saving;

  const toggle = useCallback((memberId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }, []);

  const submit = useCallback(async () => {
    if (!generasi || total === null || saving) return;

    setSaving(true);
    setBanner(null);
    try {
      const result = await createGroupPayment({
        generasi,
        year: parsedYear,
        memberIds: Array.from(selected),
        total,
        note: note.trim() || null,
      });

      const uneven =
        result.extra_cents > 0
          ? ' Jumlah tidak boleh dibahagi rata: ' +
            result.extra_cents +
            ' ahli menerima ' +
            ringgit(result.base_amount + 0.01) +
            ' dan ' +
            (result.member_count - result.extra_cents) +
            ' ahli menerima ' +
            ringgit(result.base_amount) +
            '.'
          : ' Setiap ahli: ' + ringgit(result.base_amount) + '.';

      setBanner({
        tone: result.extra_cents > 0 ? 'info' : 'positive',
        message:
          'Bayaran kumpulan ' + ringgit(total) + ' direkod untuk ' + result.member_count + ' ahli.' + uneven,
      });
      setNote('');
      setTotalOverride(null);
      // Muat semula konteks status (lunas/tunggakan) selepas bayaran.
      const rows = await fetchGroupCandidates(generasi, parsedYear);
      setCandidates(rows);
      setSelected(new Set(rows.map((row) => row.member_id)));
      setHistoryLoaded(false);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal merekod bayaran kumpulan.') });
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  }, [generasi, note, parsedYear, saving, selected, total]);

  // --- Sejarah -------------------------------------------------------------------
  const [batches, setBatches] = useState<GroupPaymentBatch[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, GroupPaymentMember[]>>({});
  const [membersLoadingId, setMembersLoadingId] = useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = useState<GroupPaymentBatch | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setBatches(await fetchGroupPaymentHistory());
      setMembers({});
      setHistoryLoaded(true);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan sejarah batch.') });
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Pengguna can_view sahaja tiada tab "baharu" — terus ke sejarah.
  const activeTab: Tab = canEdit ? tab : 'sejarah';

  useFocusEffect(
    useCallback(() => {
      if (accessLoading || !canView || activeTab !== 'sejarah' || historyLoaded) return;
      void loadHistory();
    }, [accessLoading, activeTab, canView, historyLoaded, loadHistory]),
  );

  const toggleBatch = useCallback(
    async (batch: GroupPaymentBatch) => {
      if (expandedId === batch.id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(batch.id);
      if (members[batch.id]) return;

      setMembersLoadingId(batch.id);
      try {
        const rows = await fetchGroupPaymentMembers(batch.id);
        setMembers((current) => ({ ...current, [batch.id]: rows }));
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan senarai ahli batch.') });
      } finally {
        setMembersLoadingId(null);
      }
    },
    [expandedId, members],
  );

  const confirmCancel = useCallback(async () => {
    if (!pendingCancel || cancelling) return;

    setCancelling(true);
    setBanner(null);
    try {
      const deleted = await cancelGroupPayment(pendingCancel.id);
      setBanner({
        tone: 'positive',
        message: 'Batch dibatalkan. ' + deleted + ' rekod bayaran dipadam dan baki ahli dikembalikan.',
      });
      setExpandedId(null);
      await loadHistory();
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal membatalkan batch.') });
    } finally {
      setPendingCancel(null);
      setCancelling(false);
    }
  }, [cancelling, loadHistory, pendingCancel]);

  const generationOptions = useMemo(
    () =>
      generations
        .filter((item) => item.is_active)
        .map((item) => ({ value: item.code, label: generationLabel(item.code) + ' (' + item.code + ')' })),
    [generations],
  );

  if (accessLoading) return <LoadingScreen />;

  if (!canView) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Bayaran Kumpulan" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Modul Yuran memerlukan kebenaran melihat pada department BENDAHARI."
          />
        </View>
      </Screen>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Screen padTop={false}>
        <ScreenHeader
          eyebrow="Bendahari"
          title="Bayaran Kumpulan"
          subtitle="Rekod bayaran yuran satu generasi sekali gus"
          onBackPress={goBack}
        />

        <View className="gap-5 px-gutter pb-8 pt-6">
          {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

          {canEdit ? (
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'baharu', label: 'Rekod Baharu' },
                { value: 'sejarah', label: 'Sejarah' },
              ]}
            />
          ) : null}

          {activeTab === 'baharu' ? (
            <>
              <PickerField
                label="Generasi"
                value={generasi}
                options={generationOptions}
                onChange={setGenerasi}
                placeholder="Pilih generasi"
                clearable={false}
              />

              <TextField
                label="Tahun"
                value={year}
                onChangeText={(value) => setYear(value.replace(/[^\d]/g, '').slice(0, 4))}
                keyboardType="number-pad"
                error={year.length > 0 && !yearValid ? 'Tahun antara 2000 dan 2100.' : null}
              />

              {generasi && yearValid ? (
                candidatesLoading ? (
                  <Text className="text-center text-sm text-ink-muted">Memuatkan senarai ahli...</Text>
                ) : candidates.length === 0 ? (
                  <EmptyState
                    icon="people-outline"
                    title="Tiada ahli aktif"
                    description="Tiada ahli yang tidak disekat dalam generasi ini."
                  />
                ) : (
                  <View>
                    <SectionTitle
                      title={'Ahli (' + selectedCount + ' / ' + candidates.length + ' dipilih)'}
                      caption="Status ialah maklumat sahaja — sesiapa boleh dipilih, termasuk yang sudah lunas (jadi kredit)."
                    />
                    <View className="mb-3 flex-row gap-3">
                      <Button
                        label="Pilih Semua"
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onPress={() => setSelected(new Set(candidates.map((row) => row.member_id)))}
                      />
                      <Button
                        label="Nyah-pilih Semua"
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onPress={() => setSelected(new Set())}
                      />
                    </View>

                    <View className="gap-2">
                      {candidates.map((row) => (
                        <SelectRow
                          key={row.member_id}
                          title={row.full_name}
                          subtitle={(row.nombor_ahli ?? 'Tiada nombor') + ' · ' + statusText(row, parsedYear)}
                          selected={selected.has(row.member_id)}
                          onPress={() => toggle(row.member_id)}
                        />
                      ))}
                    </View>
                  </View>
                )
              ) : null}

              {candidates.length > 0 ? (
                <View className="gap-4">
                  <TextField
                    label={
                      totalOverride === null
                        ? 'Jumlah (auto: ' + selectedCount + ' × RM' + YURAN_PER_MEMBER + ')'
                        : 'Jumlah (dilaraskan manual)'
                    }
                    value={totalOverride ?? (autoTotal > 0 ? autoTotal.toFixed(2) : '')}
                    onChangeText={setTotalOverride}
                    keyboardType="decimal-pad"
                    error={totalError}
                  />
                  {totalOverride !== null ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setTotalOverride(null)}
                      className="-mt-2 self-start active:opacity-70">
                      <Text className="text-sm font-semibold text-primary">Guna jumlah auto</Text>
                    </Pressable>
                  ) : null}

                  {split ? (
                    <Notice
                      tone={split.extra > 0 ? 'warn' : 'info'}
                      message={
                        split.extra > 0
                          ? 'Jumlah tidak boleh dibahagi rata: ' +
                            split.extra +
                            ' ahli akan menerima ' +
                            ringgit(split.base + 0.01) +
                            ' dan ' +
                            (selectedCount - split.extra) +
                            ' ahli ' +
                            ringgit(split.base) +
                            ' (jumlah tetap tepat ' +
                            ringgit(total ?? 0) +
                            ').'
                          : 'Setiap ahli menerima ' + ringgit(split.base) + '.'
                      }
                    />
                  ) : null}

                  <TextField
                    label="Nota (pilihan)"
                    placeholder="Contoh: Diskaun kumpulan"
                    value={note}
                    onChangeText={setNote}
                    maxLength={200}
                  />

                  <Button
                    label="Sahkan Bayaran Kumpulan"
                    disabled={!canSubmit}
                    loading={saving}
                    onPress={() => setConfirmOpen(true)}
                  />
                </View>
              ) : null}
            </>
          ) : (
            <View>
              <SectionTitle title={'Sejarah Batch (' + batches.length + ')'} />
              {historyLoading && !historyLoaded ? (
                <Text className="text-center text-sm text-ink-muted">Memuatkan...</Text>
              ) : batches.length === 0 ? (
                <EmptyState
                  icon="people-circle-outline"
                  title="Belum ada batch"
                  description="Bayaran kumpulan yang direkod akan dipaparkan di sini."
                />
              ) : (
                <View className="gap-3">
                  {batches.map((batch) => {
                    const open = expandedId === batch.id;
                    return (
                      <Card key={batch.id}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={'Butiran batch ' + generationLabel(batch.generasi)}
                          onPress={() => void toggleBatch(batch)}
                          className="gap-1 active:opacity-70">
                          <View className="flex-row items-center justify-between">
                            <Text className="text-base font-bold text-ink">
                              {generationLabel(batch.generasi) + ' · ' + batch.year}
                            </Text>
                            <Text className="text-base font-bold text-primary">{ringgit(batch.total_amount)}</Text>
                          </View>
                          <Text className="text-sm text-ink-muted">
                            {batch.member_count + ' ahli · ' + formatDate(batch.created_at) + ' · ' + (batch.admin_name ?? 'Admin')}
                          </Text>
                          {batch.note ? <Text className="text-sm text-ink-muted">{batch.note}</Text> : null}
                        </Pressable>

                        {open ? (
                          <View className="mt-3 gap-2 border-t border-line pt-3">
                            {membersLoadingId === batch.id ? (
                              <Text className="text-sm text-ink-muted">Memuatkan ahli...</Text>
                            ) : (members[batch.id] ?? []).length === 0 ? (
                              <Text className="text-sm text-ink-muted">Tiada rekod ahli dalam batch ini.</Text>
                            ) : (
                              (members[batch.id] ?? []).map((row) => (
                                <View key={row.member_id} className="flex-row justify-between gap-3">
                                  <Text className="flex-1 text-sm text-ink" numberOfLines={1}>
                                    {(row.nombor_ahli ? row.nombor_ahli + ' · ' : '') + row.full_name}
                                  </Text>
                                  <Text className="text-sm font-semibold text-ink">{ringgit(row.amount)}</Text>
                                </View>
                              ))
                            )}

                            {canEdit ? (
                              <Button
                                label="Batalkan Batch"
                                variant="danger"
                                size="sm"
                                className="mt-2"
                                onPress={() => setPendingCancel(batch)}
                              />
                            ) : null}
                          </View>
                        ) : null}
                      </Card>
                    );
                  })}
                </View>
              )}
            </View>
          )}
        </View>
      </Screen>

      <ConfirmDialog
        visible={confirmOpen}
        title="Sahkan bayaran kumpulan?"
        message={
          'Rekod bayaran ' +
          ringgit(total ?? 0) +
          ' untuk ' +
          selectedCount +
          ' ahli generasi ' +
          (generasi ? generationLabel(generasi) : '') +
          ' tahun ' +
          year +
          '?'
        }
        confirmLabel="Sahkan"
        busy={saving}
        onConfirm={() => void submit()}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        visible={pendingCancel !== null}
        title="Batalkan batch ini?"
        message={
          pendingCancel
            ? 'Ini akan padam SEMUA ' +
              pendingCancel.member_count +
              ' rekod bayaran dalam batch ini secara kekal. Baki tertunggak ahli akan kembali seperti sebelum bayaran kumpulan ini.'
            : ''
        }
        confirmLabel="Batalkan Batch"
        destructive
        busy={cancelling}
        onConfirm={() => void confirmCancel()}
        onCancel={() => setPendingCancel(null)}
      />
    </View>
  );
}
