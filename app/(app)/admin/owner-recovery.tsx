import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { ToastBanner } from '@/components/ui/toast';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import {
  ownerListSuperAdmins,
  ownerSearchMembers,
  ownerSetSuperAdmin,
  type MemberSearchRow,
  type SuperAdminRow,
} from '@/lib/owner';
import { usePermissions } from '@/lib/permissions';

type Banner = { tone: 'positive' | 'negative'; message: string } | null;
type Pending = { id: string; name: string; make: boolean } | null;

/**
 * Pemulihan Kecemasan — Owner sahaja. Sengaja minimum: tiada pautan ke Hub Admin.
 * Owner bukan admin; kuasa sebenar disemak oleh RPC di pangkalan data.
 */
export default function OwnerRecoveryScreen() {
  const goBack = useGoBack();
  const router = useRouter();
  const { loading: permLoading, isOwner } = usePermissions();

  const [superAdmins, setSuperAdmins] = useState<SuperAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MemberSearchRow[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  const owner = isOwner();

  const load = useCallback(async () => {
    try {
      setSuperAdmins(await ownerListSuperAdmins());
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan senarai Super Admin.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (permLoading || !owner) return;
    void load();
  }, [load, owner, permLoading]);

  const search = useCallback(async () => {
    if (searching) return;
    setSearching(true);
    try {
      setResults(await ownerSearchMembers(query));
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal mencari ahli.') });
    } finally {
      setSearching(false);
    }
  }, [query, searching]);

  const confirm = useCallback(async () => {
    if (!pending || busy) return;
    const target = pending;

    setBusy(true);
    try {
      await ownerSetSuperAdmin(target.id, target.make);
      setPending(null);
      setBanner({
        tone: 'positive',
        message: target.name + (target.make ? ' kini Super Admin.' : ' diturunkan daripada Super Admin.'),
      });
      setResults(null);
      await load();
    } catch (caught) {
      setPending(null);
      // Mesej pelayan (cth. "satu-satunya Super Admin") ialah sebab sebenar — jadikan sandaran.
      const fallback = caught instanceof Error && caught.message ? caught.message : 'Tindakan gagal.';
      setBanner({ tone: 'negative', message: toMalayError(caught, fallback) });
    } finally {
      setBusy(false);
    }
  }, [busy, load, pending]);

  if (permLoading || (owner && loading)) return <LoadingScreen />;
  if (!owner) {
    return <NoAccessScreen title="Pemulihan Kecemasan" description="Halaman ini khusus untuk Owner sahaja." />;
  }

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader eyebrow="Owner" title="Pemulihan Kecemasan" onBackPress={goBack} />

        <View className="gap-6 px-gutter pb-8 pt-6">
          <Text className="text-sm leading-5 text-ink-muted">
            Lantik atau turunkan Super Admin sekiranya akaun Super Admin sedia ada terjejas atau dirampas. Hanya Owner
            boleh melakukannya; setiap tindakan direkod dalam Log Aktiviti sebagai "(Pemulihan)".
          </Text>

          {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

          <Button
            label="Log Aktiviti Admin"
            variant="secondary"
            onPress={() => router.push('/(app)/admin/activity-log')}
          />

          <View>
            <SectionTitle title={'Super Admin semasa (' + superAdmins.length + ')'} />
            <View className="gap-3">
              {superAdmins.map((row) => {
                const name = row.full_name ?? row.email ?? 'Tanpa nama';
                return (
                  <View
                    key={row.profile_id}
                    className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-card">
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-ink">{name}</Text>
                      {row.email ? <Text className="mt-0.5 text-sm text-ink-muted">{row.email}</Text> : null}
                    </View>
                    <Button
                      label="Turunkan"
                      variant="danger"
                      size="sm"
                      onPress={() => setPending({ id: row.member_id ?? row.profile_id, name, make: false })}
                    />
                  </View>
                );
              })}
            </View>
          </View>

          <View>
            <SectionTitle title="Lantik Super Admin" caption="Cari ahli mengikut nama atau nombor ahli (min. 2 huruf)." />
            <View className="gap-3">
              <TextField
                label="Cari ahli"
                placeholder="Nama atau nombor ahli"
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Button
                label="Cari"
                variant="secondary"
                loading={searching}
                disabled={searching || query.trim().length < 2}
                onPress={() => void search()}
              />

              {results !== null && results.length === 0 ? (
                <Text className="py-4 text-center text-sm text-ink-muted">Tiada ahli sepadan.</Text>
              ) : null}

              {results?.map((row) => (
                <View
                  key={row.member_id}
                  className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-card">
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-ink">{row.full_name}</Text>
                    <Text className="mt-0.5 text-sm text-ink-muted">
                      {(row.nombor_ahli ?? 'Tiada nombor') + ' · ' + (row.email ?? 'Tiada emel')}
                    </Text>
                  </View>
                  <Button
                    label="Lantik"
                    size="sm"
                    onPress={() => setPending({ id: row.member_id, name: row.full_name, make: true })}
                  />
                </View>
              ))}
            </View>
          </View>
        </View>
      </Screen>

      <ConfirmDialog
        visible={pending !== null}
        title={pending?.make ? 'Lantik sebagai Super Admin?' : 'Turunkan Super Admin?'}
        message={
          pending?.make
            ? pending.name + ' akan mendapat akses penuh ke semua department dan panel Super Admin.'
            : (pending?.name ?? '') + ' akan hilang akses Super Admin serta-merta.'
        }
        confirmLabel={pending?.make ? 'Lantik' : 'Turunkan'}
        destructive={!pending?.make}
        busy={busy}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
