import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { NoAccessScreen, SUPER_ADMIN_ONLY } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { Colors } from '@/constants/theme';
import {
  ACTIVITY_CATEGORY_OPTIONS,
  ACTIVITY_PAGE_SIZE,
  TARGET_TYPE_ICON,
  TARGET_TYPE_LABEL,
  fetchAdminActivity,
  type ActivityCategory,
  type AdminActivity,
} from '@/lib/activity-log';
import { fetchAssignments, fetchDepartments, fetchProfiles } from '@/lib/admin';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/permissions';
import { MONTH_NAMES, ROLE_LABEL } from '@/types/database';

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}

/**
 * Log Aktiviti Admin — Super Admin sahaja.
 *
 * Nama pelaku ialah salinan pada MASA tindakan. Department pula dibaca LANGSUNG
 * daripada `admin_assignments` hari ini dan dilabel "Department semasa" —
 * sistem tidak menyimpan department pelaku pada masa lampau, jadi memaparkannya
 * tanpa label itu akan mengelirukan bila seseorang sudah bertukar department.
 */
export default function ActivityLogScreen() {
  const goBack = useGoBack();
  const { isSuperAdmin, loading: permissionsLoading } = usePermissions();
  const allowed = !permissionsLoading && isSuperAdmin();

  const [rows, setRows] = useState<AdminActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ActivityCategory | null>(null);

  // Tunggu pengguna berhenti menaip sebelum menyoal pelayan.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  /*
    Department semasa bagi setiap akaun. Kegagalan SENYAP: log masih berguna
    tanpanya, dan baris "Department semasa" sekadar tidak dipapar.
  */
  const [currentRole, setCurrentRole] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!allowed) return;
    let active = true;

    void (async () => {
      try {
        const [assignments, departments, profiles] = await Promise.all([
          fetchAssignments(),
          fetchDepartments(),
          fetchProfiles(),
        ]);
        if (!active) return;

        const deptName = new Map(departments.map((row) => [row.id, row.name]));
        const byUser = new Map<string, string[]>();
        for (const row of assignments) {
          const name = deptName.get(row.department_id);
          if (!name) continue;
          byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), name]);
        }

        const next = new Map<string, string>();
        for (const profile of profiles) {
          const names = (byUser.get(profile.id) ?? []).sort();
          if (profile.role === 'super_admin') {
            next.set(profile.id, [ROLE_LABEL.super_admin, ...names].join(', '));
          } else {
            next.set(profile.id, names.length ? names.join(', ') : 'Tiada — bukan admin lagi');
          }
        }
        setCurrentRole(next);
      } catch {
        // Lihat komen di atas.
      }
    })();

    return () => {
      active = false;
    };
  }, [allowed]);

  // Nombor permintaan terkini — jawapan carian lama yang tiba lewat dibuang.
  const requestRef = useRef(0);

  useEffect(() => {
    if (!allowed) return;
    const token = ++requestRef.current;
    setLoading(true);

    void (async () => {
      try {
        const page = await fetchAdminActivity({ search: query, category, offset: 0 });
        if (token !== requestRef.current) return;
        setRows(page);
        setHasMore(page.length === ACTIVITY_PAGE_SIZE);
        setError(null);
      } catch (caught) {
        if (token === requestRef.current) setError(toMalayError(caught, 'Gagal memuatkan log aktiviti.'));
      } finally {
        if (token === requestRef.current) setLoading(false);
      }
    })();
  }, [allowed, category, query]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore) return;
    const token = requestRef.current;
    setLoadingMore(true);
    try {
      const page = await fetchAdminActivity({ search: query, category, offset: rows.length });
      if (token !== requestRef.current) return;
      setRows((current) => [...current, ...page]);
      setHasMore(page.length === ACTIVITY_PAGE_SIZE);
    } catch (caught) {
      setError(toMalayError(caught, 'Gagal memuatkan log aktiviti.'));
    } finally {
      setLoadingMore(false);
    }
  }, [category, hasMore, loading, loadingMore, query, rows.length]);

  const filtering = query !== '' || category !== null;
  const title = useMemo(
    () => (filtering ? 'Padanan (' + rows.length + (hasMore ? '+' : '') + ')' : 'Aktiviti terkini'),
    [filtering, hasMore, rows.length],
  );

  if (permissionsLoading) return <LoadingScreen />;
  if (!allowed) return <NoAccessScreen title="Log Aktiviti Admin" description={SUPER_ADMIN_ONLY} />;

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Super Admin"
        title="Log Aktiviti Admin"
        subtitle="Siapa buat apa, dan bila"
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {error ? <Notice tone="negative" message={error} /> : null}

        <View className="gap-4">
          <TextField
            label="Cari"
            placeholder="Nama admin, tindakan atau sasaran"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <PickerField
            label="Kategori"
            placeholder="Semua kategori"
            value={category}
            options={ACTIVITY_CATEGORY_OPTIONS}
            onChange={setCategory}
            clearable
          />
        </View>

        {loading ? (
          <View className="items-center py-10">
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={filtering ? 'search-outline' : 'document-text-outline'}
            title={filtering ? 'Tiada padanan' : 'Belum ada aktiviti'}
            description={
              filtering
                ? 'Tiada aktiviti sepadan dengan carian atau kategori ini.'
                : 'Tindakan admin akan direkodkan di sini secara automatik.'
            }
          />
        ) : (
          <View>
            <SectionTitle
              title={title}
              caption={'"Department semasa" ialah department pelaku HARI INI, bukan pada masa tindakan.'}
            />

            <View className="gap-3">
              {rows.map((row) => (
                <ActivityRow
                  key={row.id}
                  row={row}
                  currentRole={row.actor_id ? currentRole.get(row.actor_id) : 'Akaun telah dipadam'}
                />
              ))}
            </View>

            {hasMore ? (
              <View className="pt-4">
                <Button
                  label="Muat lagi"
                  variant="secondary"
                  loading={loadingMore}
                  onPress={() => void loadMore()}
                />
              </View>
            ) : null}
          </View>
        )}
      </View>
    </Screen>
  );
}

function ActivityRow({ row, currentRole }: { row: AdminActivity; currentRole: string | undefined }) {
  const label = typeof row.details?.label === 'string' ? row.details.label : null;
  const changed = Array.isArray(row.details?.diubah) ? row.details.diubah : [];
  const meta = [
    TARGET_TYPE_LABEL[row.target_type] ?? row.target_type,
    row.target_id ? '#' + row.target_id.slice(0, 8) : null,
    formatWhen(row.created_at),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View className="flex-row items-start gap-3 rounded-card border border-line bg-surface p-card">
      <View className="h-9 w-9 items-center justify-center rounded-pill bg-primary-soft">
        <Ionicons name={TARGET_TYPE_ICON[row.target_type] ?? 'ellipse-outline'} size={16} color={Colors.primary} />
      </View>

      <View className="flex-1 gap-0.5">
        <Text className="text-base font-semibold text-ink">{row.action}</Text>
        {label ? (
          <Text className="text-sm text-ink" numberOfLines={2}>
            {label}
          </Text>
        ) : null}
        <Text className="text-xs text-ink-muted">{meta}</Text>
        {changed.length ? (
          <Text className="text-xs text-ink-faint" numberOfLines={2}>
            Medan: {changed.join(', ')}
          </Text>
        ) : null}

        <View className="mt-2 gap-0.5 border-t border-line pt-2">
          <Text className="text-xs text-ink-muted">
            oleh <Text className="font-semibold text-ink">{row.actor_name}</Text>
          </Text>
          {currentRole ? <Text className="text-xs text-ink-faint">Department semasa: {currentRole}</Text> : null}
        </View>
      </View>
    </View>
  );
}
