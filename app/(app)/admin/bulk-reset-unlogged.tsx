import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormModal } from '@/components/ui/form-modal';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/permissions';
import {
  TEMP_PASSWORD,
  bulkResetUnloggedMembers,
  fetchPendingFirstLogin,
  type BulkResetSummary,
  type PendingFirstLogin,
} from '@/lib/temp-password';

/** Perkataan yang mesti ditaip penuh sebelum butang sahkan hidup. */
const CONFIRM_WORD = 'RESET';

/**
 * Tetapkan semula kata laluan semua ahli yang belum berjaya log masuk kali
 * pertama.
 *
 * Skop dipapar SEBELUM apa-apa boleh ditekan. Operasi ini menyentuh ratusan
 * akaun sekaligus, dan "berapa ramai" ialah soalan yang mesti dijawab sebelum
 * butang, bukan selepasnya — kiraan itu sendiri yang memberitahu admin sama ada
 * dia menekan butang yang betul.
 *
 * Pengesahan dua lapis: dialog dahulu, kemudian perkataan yang ditaip penuh.
 * Lapisan kedua itu bukan halangan untuk halangan; ia memaksa admin membaca
 * sekali lagi selepas dia sudah memutuskan, yang merupakan satu-satunya masa
 * amaran benar-benar dibaca.
 */
export default function BulkResetUnloggedScreen() {
  const goBack = useGoBack();
  const { loading: permissionsLoading, isSuperAdmin } = usePermissions();

  const [scope, setScope] = useState<PendingFirstLogin | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [scopeLoading, setScopeLoading] = useState(true);

  const [dialog, setDialog] = useState(false);
  const [typeModal, setTypeModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<BulkResetSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const superAdmin = !permissionsLoading && isSuperAdmin();

  const loadScope = useCallback(async () => {
    setScopeLoading(true);
    try {
      const row = await fetchPendingFirstLogin();
      setScope(row);
      setScopeError(null);
    } catch (caught) {
      setScope(null);
      setScopeError(toMalayError(caught, 'Gagal mengira bilangan ahli.'));
    } finally {
      setScopeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!superAdmin) return;
    void loadScope();
  }, [loadScope, superAdmin]);

  const run = useCallback(async () => {
    if (busy) return;

    setError(null);
    setBusy(true);
    try {
      const result = await bulkResetUnloggedMembers();
      setTypeModal(false);
      setConfirmText('');
      setSummary(result);
      // Kiraan dibaca semula: selepas reset berjaya, ahli itu masih tergolong
      // dalam syarat yang sama, tetapi tetingkapnya kini baharu. Nombor yang
      // lapuk pada skrin selepas operasi lebih mengelirukan daripada berguna.
      await loadScope();
    } catch (caught) {
      setTypeModal(false);
      setError(toMalayError(caught, 'Gagal menetapkan semula kata laluan secara pukal.'));
    } finally {
      setBusy(false);
    }
  }, [busy, loadScope]);

  if (permissionsLoading) return <LoadingScreen />;

  if (!isSuperAdmin()) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Reset Akaun" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Menetapkan semula kata laluan secara pukal khusus untuk Super Admin sahaja."
          />
        </View>
      </Screen>
    );
  }

  const jumlah = scope?.jumlah ?? 0;

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader
          eyebrow="Panel Admin"
          title="Reset Akaun Belum Login"
          subtitle="Ahli yang belum berjaya log masuk kali pertama"
          onBackPress={goBack}
        />

        <View className="gap-6 px-gutter pt-6">
          {error ? <Notice tone="negative" message={error} /> : null}
          {scopeError ? <Notice tone="negative" message={scopeError} /> : null}
          {summary?.peringatan ? <Notice tone="negative" message={summary.peringatan} /> : null}

          {/*
            Skop dahulu, butang kemudian. Nombor ini ialah keseluruhan keputusan
            yang perlu dibuat admin.
          */}
          <View>
            <SectionTitle title="Skop" caption="Dikira sekarang, sebelum apa-apa diubah." />
            <Card>
              {scopeLoading ? (
                <Text className="text-base text-ink-muted">Mengira...</Text>
              ) : (
                <View className="gap-1">
                  <Text className="text-stat font-bold text-ink">{jumlah}</Text>
                  <Text className="text-sm text-ink-muted">
                    {jumlah === 1 ? 'ahli akan direset' : 'ahli akan direset'}
                  </Text>
                  {scope && scope.tempoh_tamat > 0 ? (
                    <Text className="mt-2 text-sm text-ink-muted">
                      {'Antaranya ' + scope.tempoh_tamat + ' sudah tamat tempoh kata laluan sementara.'}
                    </Text>
                  ) : null}
                </View>
              )}
            </Card>
          </View>

          <Notice
            tone="warn"
            message={
              'Setiap ahli yang terjejas akan menerima kata laluan yang SAMA — "' +
              TEMP_PASSWORD +
              '" — dengan tempoh baharu tiga hari.'
            }
          />

          <View>
            <SectionTitle title="Siapa yang terjejas" />
            <Card>
              <View className="gap-3">
                <Bullet text="Ahli yang mempunyai akaun tetapi belum pernah menetapkan kata laluannya sendiri." />
                <Bullet text="Termasuk yang tidak pernah cuba log masuk langsung." />
                <Bullet text="Termasuk yang tempoh kata laluan sementaranya sudah tamat sebelum sempat menukarnya." />
                <Bullet text="Termasuk yang pernah direset secara individu tetapi masih belum selesai." />
                <Bullet text="TIDAK termasuk ahli yang sudah menetapkan kata laluannya sendiri — kata laluan mereka tidak disentuh." />
                <Bullet text="TIDAK termasuk ahli yang belum mempunyai akaun langsung; gunakan Provision Akaun Ahli untuk mereka." />
              </View>
            </Card>
          </View>

          <Button
            label="Reset Semua Sekarang"
            variant="danger"
            loading={busy}
            disabled={busy || scopeLoading || jumlah === 0}
            onPress={() => setDialog(true)}
          />

          {jumlah === 0 && !scopeLoading ? (
            <Text className="text-center text-sm text-ink-muted">
              Tiada ahli yang sepadan. Semua ahli yang mempunyai akaun sudah menetapkan kata laluan sendiri.
            </Text>
          ) : null}

          {summary ? (
            <View className="pb-8">
              <SectionTitle title="Hasil" />
              <Card>
                <View className="gap-2">
                  <Line label="Berjaya direset" value={String(summary.jumlah_diproses)} />
                  <Line label="Gagal" value={String(summary.jumlah_gagal)} />
                  <Line label="Kata laluan baharu" value={summary.password} />
                  <Line
                    label="Sah sehingga"
                    value={summary.expires_at ? new Date(summary.expires_at).toLocaleString('ms-MY') : '—'}
                  />
                </View>
              </Card>

              {summary.senarai_gagal.length > 0 ? (
                <View className="mt-4 gap-2">
                  <Text className="text-sm font-semibold text-ink">Yang gagal</Text>
                  {summary.senarai_gagal.map((row, index) => (
                    <View
                      key={(row.nombor_ahli ?? '') + ':' + index}
                      className="rounded-field border border-line bg-surface p-3">
                      <Text className="text-sm font-semibold text-ink">
                        {(row.nombor_ahli ? row.nombor_ahli + ' · ' : '') + row.full_name}
                      </Text>
                      <Text className="mt-0.5 text-xs text-ink-muted">{row.sebab}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </Screen>

      <ConfirmDialog
        visible={dialog}
        title={'Reset ' + jumlah + ' akaun?'}
        message={
          'Ini akan tetapkan semula kata laluan SEMUA ahli yang belum berjaya log masuk kali pertama (termasuk yang tempoh sebelum ini sudah tamat) kepada "' +
          TEMP_PASSWORD +
          '", dengan tempoh baharu 3 hari. Ahli yang sudah menetapkan kata laluan sendiri tidak terjejas.'
        }
        confirmLabel="Teruskan"
        destructive
        onConfirm={() => {
          setDialog(false);
          setConfirmText('');
          setTypeModal(true);
        }}
        onCancel={() => setDialog(false)}
      />

      <FormModal
        visible={typeModal}
        title={'Sahkan reset ' + jumlah + ' akaun'}
        description={
          'Kata laluan ' +
          jumlah +
          ' ahli akan ditetapkan semula kepada "' +
          TEMP_PASSWORD +
          '". Sesi mereka yang sedang berjalan akan terbatal, dan mereka perlu log masuk semula dengan kata laluan sementara itu.'
        }
        dismissable={!busy}
        onClose={() => setTypeModal(false)}>
        <Notice tone="warn" message={'Taip ' + CONFIRM_WORD + ' di bawah untuk mengesahkan.'} />

        <TextField
          label={'Taip ' + CONFIRM_WORD}
          placeholder={CONFIRM_WORD}
          value={confirmText}
          onChangeText={setConfirmText}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!busy}
        />

        <Button
          label="Reset Semua Sekarang"
          variant="danger"
          loading={busy}
          disabled={busy || confirmText.trim().toUpperCase() !== CONFIRM_WORD}
          onPress={() => void run()}
        />
      </FormModal>
    </>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View className="flex-row gap-2">
      <Text className="text-sm text-ink-muted">•</Text>
      <Text className="flex-1 text-sm leading-5 text-ink-muted">{text}</Text>
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-4">
      <Text className="flex-1 text-sm text-ink-muted">{label}</Text>
      <Text className="text-base font-semibold text-ink">{value}</Text>
    </View>
  );
}
