import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

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
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { SelectRow } from '@/components/ui/select-row';
import { TextField } from '@/components/ui/text-field';
import { ToastBanner } from '@/components/ui/toast';
import { demoteSuperAdmin, fetchAssignments, fetchProfiles, setRole } from '@/lib/admin';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/permissions';
import { profileName, ROLE_LABEL, type AdminAssignment, type Profile } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

export default function SuperAdminsScreen() {
  const goBack = useGoBack();
  const { profile: me, refresh: refreshPermissions, isSuperAdmin } = usePermissions();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<AdminAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  const load = useCallback(async () => {
    try {
      const [nextProfiles, nextAssignments] = await Promise.all([fetchProfiles(), fetchAssignments()]);
      setProfiles(nextProfiles);
      setAssignments(nextAssignments);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan senarai Super Admin.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const superAdmins = useMemo(() => profiles.filter((row) => row.role === 'super_admin'), [profiles]);
  const isLastSuperAdmin = superAdmins.length <= 1;

  // --- Lantik Super Admin baharu -------------------------------------------
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pendingPromote, setPendingPromote] = useState<Profile | null>(null);
  const [promoteBusy, setPromoteBusy] = useState(false);

  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    return profiles
      .filter((row) => row.role !== 'super_admin' && row.role !== 'owner')
      .filter(
        (row) =>
          !term || profileName(row).toLowerCase().includes(term) || (row.email ?? '').toLowerCase().includes(term),
      );
  }, [profiles, search]);

  const openPicker = useCallback(() => {
    setBanner(null);
    setSearch('');
    setPickerOpen(true);
  }, []);

  const confirmPromote = useCallback(async () => {
    if (!pendingPromote || promoteBusy) return;

    const target = pendingPromote;
    setPromoteBusy(true);
    try {
      await setRole(target.id, 'super_admin');
      setPendingPromote(null);
      await load();
      setBanner({ tone: 'positive', message: profileName(target) + ' kini Super Admin.' });
    } catch (caught) {
      setPendingPromote(null);
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal melantik Super Admin.') });
    } finally {
      setPromoteBusy(false);
    }
  }, [load, pendingPromote, promoteBusy]);

  // --- Turunkan pangkat -----------------------------------------------------
  const [pendingDemote, setPendingDemote] = useState<Profile | null>(null);
  const [demoteBusy, setDemoteBusy] = useState(false);

  const requestDemote = useCallback(
    (target: Profile) => {
      // Sistem mesti sentiasa mempunyai sekurang-kurangnya seorang Super Admin,
      // jika tidak panel ini tidak akan dapat dibuka oleh sesiapa pun lagi.
      if (isLastSuperAdmin) {
        setBanner({
          tone: 'negative',
          message:
            'Tidak boleh diturunkan — ' +
            (target.id === me?.id ? 'anda' : profileName(target)) +
            ' ialah satu-satunya Super Admin. Lantik Super Admin lain dahulu.',
        });
        return;
      }

      setBanner(null);
      setPendingDemote(target);
    },
    [isLastSuperAdmin, me?.id],
  );

  const confirmDemote = useCallback(async () => {
    if (!pendingDemote || demoteBusy) return;

    const target = pendingDemote;
    const hasAssignments = assignments.some((row) => row.user_id === target.id);

    setDemoteBusy(true);
    try {
      await demoteSuperAdmin(target.id, hasAssignments);
      setPendingDemote(null);
      await load();
      // Bila diri sendiri yang diturunkan, guard /admin perlu tahu serta-merta.
      if (target.id === me?.id) await refreshPermissions();

      setBanner({
        tone: 'positive',
        message:
          profileName(target) + ' kini ' + (hasAssignments ? ROLE_LABEL.admin : ROLE_LABEL.ahli) + '.',
      });
    } catch (caught) {
      setPendingDemote(null);
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menurunkan pangkat.') });
    } finally {
      setDemoteBusy(false);
    }
  }, [assignments, demoteBusy, load, me?.id, pendingDemote, refreshPermissions]);

  if (loading) return <LoadingScreen />;
  if (!isSuperAdmin()) return <NoAccessScreen title="Panel Super Admin" description={SUPER_ADMIN_ONLY} />;

  const demoteToRole = pendingDemote && assignments.some((row) => row.user_id === pendingDemote.id)
    ? ROLE_LABEL.admin
    : ROLE_LABEL.ahli;

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader
          eyebrow="Panel Super Admin"
          title="Super Admin"
          subtitle={superAdmins.length + ' Super Admin'}
          onBackPress={goBack}
        />

        <View className="gap-6 px-gutter pt-6">
          {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

          {isLastSuperAdmin ? (
            <Notice
              tone="info"
              message="Hanya seorang Super Admin dalam sistem. Lantik seorang lagi sebelum sebarang penurunan pangkat dibenarkan."
            />
          ) : null}

          <Button label="Lantik Super Admin Baru" onPress={openPicker} />

          {superAdmins.length === 0 ? (
            <EmptyState
              icon="shield-checkmark-outline"
              title="Tiada Super Admin"
              description="Lantik Super Admin pertama melalui Supabase SQL Editor."
            />
          ) : (
            <View>
              <SectionTitle title="Senarai Super Admin" caption="Super Admin mempunyai akses penuh ke semua department." />
              <View className="gap-4">
                {superAdmins.map((admin) => {
                  const self = admin.id === me?.id;

                  return (
                    <View
                      key={admin.id}
                      className="flex-row items-start gap-3 rounded-card border border-line bg-surface p-card">
                      <View className="flex-1">
                        <Text className="text-base font-semibold text-ink">{profileName(admin)}</Text>
                        {admin.email ? <Text className="mt-0.5 text-sm text-ink-muted">{admin.email}</Text> : null}
                        {self ? (
                          <View className="mt-2">
                            <Badge label="Anda" tone="primary" />
                          </View>
                        ) : null}
                      </View>

                      <IconButton
                        icon="arrow-down-circle-outline"
                        tone="danger"
                        accessibilityLabel={'Turunkan pangkat ' + profileName(admin)}
                        onPress={() => requestDemote(admin)}
                      />
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      </Screen>

      <FormModal
        visible={pickerOpen}
        title="Lantik Super Admin"
        description="Pilih ahli atau admin sedia ada. Super Admin mempunyai akses penuh ke semua department dan boleh melantik Super Admin lain."
        onClose={() => setPickerOpen(false)}>
        <TextField
          label="Cari ahli"
          placeholder="Nama atau emel"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {candidates.length === 0 ? (
          <Text className="py-6 text-center text-sm text-ink-muted">Tiada ahli sepadan.</Text>
        ) : (
          <View className="gap-3">
            {candidates.map((candidate) => (
              <SelectRow
                key={candidate.id}
                title={profileName(candidate)}
                subtitle={(candidate.email ?? 'Tiada emel') + ' · ' + ROLE_LABEL[candidate.role]}
                selected={false}
                onPress={() => {
                  setPickerOpen(false);
                  setPendingPromote(candidate);
                }}
              />
            ))}
          </View>
        )}
      </FormModal>

      <ConfirmDialog
        visible={pendingPromote !== null}
        title="Lantik sebagai Super Admin?"
        message={
          (pendingPromote ? profileName(pendingPromote) : '') +
          ' akan mendapat akses penuh ke semua department dan boleh mengurus Super Admin lain, termasuk menurunkan pangkat anda.'
        }
        confirmLabel="Lantik"
        busy={promoteBusy}
        onConfirm={() => void confirmPromote()}
        onCancel={() => setPendingPromote(null)}
      />

      <ConfirmDialog
        visible={pendingDemote !== null}
        title={pendingDemote?.id === me?.id ? 'Turunkan pangkat anda sendiri?' : 'Turunkan pangkat?'}
        message={
          pendingDemote?.id === me?.id
            ? 'Anda akan menjadi ' +
              demoteToRole +
              ' dan HILANG akses ke panel Super Admin serta-merta. Hanya Super Admin lain yang boleh memulihkannya.'
            : (pendingDemote ? profileName(pendingDemote) : '') + ' akan menjadi ' + demoteToRole + '.'
        }
        confirmLabel="Turunkan Pangkat"
        destructive
        busy={demoteBusy}
        onConfirm={() => void confirmDemote()}
        onCancel={() => setPendingDemote(null)}
      />
    </>
  );
}
