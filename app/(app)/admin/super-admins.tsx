import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { NoAccessScreen, SUPER_ADMIN_ONLY } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { fetchProfiles } from '@/lib/admin';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/permissions';
import { profileName, type Profile } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

export default function SuperAdminsScreen() {
  const goBack = useGoBack();
  const { profile: me, isSuperAdmin } = usePermissions();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  const load = useCallback(async () => {
    try {
      setProfiles(await fetchProfiles());
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

  if (loading) return <LoadingScreen />;
  if (!isSuperAdmin()) return <NoAccessScreen title="Panel Super Admin" description={SUPER_ADMIN_ONLY} />;

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
          {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

          <Notice
            tone="info"
            message="Hanya Owner boleh melantik atau menurunkan Super Admin (pemulihan kecemasan). Hubungi Owner jika perlu."
          />

          {superAdmins.length === 0 ? (
            <EmptyState
              icon="shield-checkmark-outline"
              title="Tiada Super Admin"
              description="Hubungi Owner untuk melantik Super Admin."
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

                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      </Screen>

    </>
  );
}
