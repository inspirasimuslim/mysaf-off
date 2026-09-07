import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/permissions';
import { TEMP_PASSWORD, provisionMemberAccounts, type ProvisionSummary } from '@/lib/temp-password';

/**
 * Cipta akaun log masuk untuk setiap ahli yang belum ada.
 *
 * Rekod ahli datang daripada import Excel dan tidak membawa akaun. Sebelum ini
 * setiap satu perlu dicipta secara individu, yang bermakna ratusan ahli tidak
 * pernah mendapat akaun langsung.
 *
 * Skrin ini SENGAJA memegang satu butang sahaja. Ia menjalankan satu operasi
 * yang menyentuh ratusan akaun, dan setiap pilihan tambahan di sini ialah satu
 * lagi cara untuk menjalankannya secara separuh betul.
 */
export default function ProvisionAccountsScreen() {
  const goBack = useGoBack();
  const { loading, isSuperAdmin } = usePermissions();

  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ProvisionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (busy) return;

    setError(null);
    setBusy(true);
    try {
      const result = await provisionMemberAccounts();
      setDialog(false);
      setSummary(result);
    } catch (caught) {
      setDialog(false);
      setError(toMalayError(caught, 'Gagal mencipta akaun ahli.'));
    } finally {
      setBusy(false);
    }
  }, [busy]);

  if (loading) return <LoadingScreen />;

  if (!isSuperAdmin()) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Provision Akaun" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Mencipta akaun secara pukal khusus untuk Super Admin sahaja."
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
          title="Provision Akaun Ahli"
          subtitle="Cipta akaun log masuk untuk ahli yang belum ada"
          onBackPress={goBack}
        />

        <View className="gap-6 px-gutter pt-6">
          {error ? <Notice tone="negative" message={error} /> : null}

          <Notice
            tone="warn"
            message={
              'Setiap akaun baharu menerima kata laluan yang SAMA — "' +
              TEMP_PASSWORD +
              '" — dan sah selama tiga hari sahaja. Ahli dipaksa menetapkan kata laluannya sendiri pada log masuk pertama.'
            }
          />

          <View>
            <SectionTitle
              title="Apa yang berlaku"
              caption="Operasi ini selamat dijalankan berkali-kali."
            />
            <Card>
              <View className="gap-3">
                <Bullet text="Setiap ahli yang mempunyai emel tetapi belum ada akaun akan mendapat akaun baharu." />
                <Bullet text="Ahli yang emelnya SUDAH mempunyai akaun tidak diberi akaun kedua — pautan rekodnya dipulihkan sahaja, dan kata laluannya tidak disentuh." />
                <Bullet text="Ahli tanpa emel dilangkau; akaun log masuk memerlukan emel." />
                <Bullet text="Ahli yang sudah ada akaun dan sudah menetapkan kata laluan sendiri TIDAK terjejas." />
              </View>
            </Card>
          </View>

          <Button
            label="Cipta Akaun untuk Semua Ahli Tanpa Akaun"
            loading={busy}
            disabled={busy}
            onPress={() => setDialog(true)}
          />

          {summary ? (
            <View className="pb-8">
              <SectionTitle title="Hasil" />
              <Card>
                <View className="gap-2">
                  <Line label="Akaun dicipta" value={String(summary.dicipta)} />
                  <Line label="Rekod dipaut semula" value={String(summary.dipaut_semula)} />
                  <Line label="Dilangkau (sudah ada akaun)" value={String(summary.dilangkau_sudah_ada_akaun)} />
                  <Line label="Dilangkau (tiada emel)" value={String(summary.dilangkau_tiada_emel)} />
                  <Line label="Gagal" value={String(summary.gagal.length)} />
                </View>
              </Card>

              {summary.gagal.length > 0 ? (
                <View className="mt-4 gap-2">
                  <Text className="text-sm font-semibold text-ink">Yang gagal</Text>
                  {summary.gagal.map((row) => (
                    <View key={row.email} className="rounded-field border border-line bg-surface p-3">
                      <Text className="text-sm font-semibold text-ink">{row.email}</Text>
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
        title="Cipta akaun untuk semua?"
        message={
          'Setiap ahli yang mempunyai emel tetapi belum ada akaun akan menerima akaun log masuk dengan kata laluan "' +
          TEMP_PASSWORD +
          '", sah selama tiga hari. Ahli yang sudah ada akaun tidak akan terjejas.'
        }
        confirmLabel="Cipta Akaun"
        busy={busy}
        onConfirm={() => void run()}
        onCancel={() => setDialog(false)}
      />
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
