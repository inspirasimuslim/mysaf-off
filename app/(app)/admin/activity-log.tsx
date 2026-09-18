import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { NoAccessScreen, SUPER_ADMIN_ONLY } from '@/components/no-access';
import { SaveShareButtons } from '@/components/save-share-buttons';
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
  TARGET_TYPE_LABEL,
  downloadAdminActivityLog,
  fetchAdminActivity,
  type ActivityCategory,
  type AdminActivity,
} from '@/lib/activity-log';
import { groupActivity, type ActivityGroup } from '@/lib/activity-group';
import { fetchAssignments, fetchDepartments, fetchProfiles } from '@/lib/admin';
import { toMalayError } from '@/lib/errors';
import { deliveryMessage, type DeliveryMode } from '@/lib/file-delivery';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/permissions';
import { MONTH_NAMES, ROLE_LABEL } from '@/types/database';

/** Pemisah "·" sebagai escape — lihat supabase/functions/admin-create-member. */
const SEP = ' · ';

/** Blok teratas dibuka; selebihnya tertutup supaya senarai panjang boleh diimbas. */
const OPEN_BY_DEFAULT = 3;

function formatDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/**
 * Log Aktiviti Admin — Super Admin sahaja.
 *
 * Dikumpul ikut admin + hari kerana soalan yang biasa ditanya ialah "apa yang
 * si polan buat semalam", bukan membaca satu demi satu tindakan. Setiap
 * tindakan satu baris; butiran penuh (medan diubah, amaun, dsb.) hanya bila
 * baris diketuk.
 *
 * Nama admin ialah salinan pada MASA tindakan. Department pula dibaca LANGSUNG
 * daripada `admin_assignments` hari ini — sistem tidak menyimpan department
 * pada masa lampau — dan dipapar sekali pada kepala blok dengan nota semasa.
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
  const [exporting, setExporting] = useState<DeliveryMode | null>(null);
  const [exportNotice, setExportNotice] = useState<{ tone: 'positive' | 'info' | 'negative'; message: string } | null>(
    null,
  );

  // Tunggu pengguna berhenti menaip sebelum menyoal pelayan.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  /*
    Department semasa bagi setiap akaun. Kegagalan SENYAP: log masih berguna
    tanpanya, dan kepala blok sekadar tidak memaparkannya.
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
            next.set(profile.id, names.length ? names.join(', ') : 'Bukan admin lagi');
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

  /**
   * Muat turun log mengikut tapisan yang sedang dipapar.
   *
   * `query` dan bukan `search`: fail patut sepadan dengan senarai di skrin, dan
   * senarai itu menunggu pengguna berhenti menaip sebelum menyoal pelayan.
   */
  const exportLog = useCallback(
    async (mode: DeliveryMode) => {
      if (exporting) return;

      setExportNotice(null);
      setExporting(mode);
      try {
        const report = await downloadAdminActivityLog({ search: query, category }, mode);
        setExportNotice({
          tone: report.result === 'cancelled' ? 'info' : 'positive',
          message: deliveryMessage(report.result, report.fileName, report.rows + ' tindakan'),
        });
      } catch (caught) {
        setExportNotice({ tone: 'negative', message: toMalayError(caught, 'Gagal memuat turun log.') });
      } finally {
        setExporting(null);
      }
    },
    [category, exporting, query],
  );

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

  const groups = useMemo(() => groupActivity(rows), [rows]);

  const filtering = query !== '' || category !== null;
  const count = rows.length + (hasMore ? '+' : '');

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
        {exportNotice ? <Notice tone={exportNotice.tone} message={exportNotice.message} /> : null}

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

          {/*
            Fail mengambil tapisan yang sedang dipapar — bukan halaman yang
            sedang dipapar. Lihat `downloadAdminActivityLog`.
          */}
          <SaveShareButtons
            kind="file"
            variant="secondary"
            webLabel="Muat Turun Log (.xlsx)"
            nativeCaption="Log Aktiviti Admin (.xlsx)"
            busy={exporting}
            disabled={loading || rows.length === 0}
            onPress={(mode) => void exportLog(mode)}
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
              title={(filtering ? 'Padanan' : 'Aktiviti terkini') + ' (' + count + ')'}
              caption="Dikumpul ikut admin dan hari. Department pada kepala blok ialah department SEMASA admin, bukan pada masa tindakan."
            />

            <View className="gap-3">
              {groups.map((group, index) => (
                <GroupBlock
                  key={group.key}
                  group={group}
                  currentRole={group.actorId ? currentRole.get(group.actorId) : 'Akaun telah dipadam'}
                  defaultOpen={index < OPEN_BY_DEFAULT}
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

/*
  Bentuk dan kelakuan sama seperti `CollapsibleSection` (kad, chevron, pil
  kiraan), tetapi lebih padat: komponen itu dibina untuk borang dengan jarak
  `gap-4`, yang menjadikan senarai satu baris kelihatan longgar.
*/
function GroupBlock({
  group,
  currentRole,
  defaultOpen,
}: {
  group: ActivityGroup;
  currentRole: string | undefined;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const subtitle = formatDay(group.latestAt) + (currentRole ? SEP + currentRole : '');

  return (
    <View className="overflow-hidden rounded-card border border-line bg-surface">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={group.actorName + ', ' + formatDay(group.latestAt)}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        className="flex-row items-center gap-3 px-4 py-3 active:opacity-70">
        <View className="flex-1">
          <Text className="text-sm font-bold text-ink" numberOfLines={1}>
            {group.actorName}
          </Text>
          <Text className="mt-0.5 text-xs text-ink-muted" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>

        <View className="rounded-pill bg-primary-soft px-2.5 py-0.5">
          <Text className="text-xs font-semibold text-primary">{group.rows.length} tindakan</Text>
        </View>

        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.inkMuted} />
      </Pressable>

      {open ? (
        <View className="border-t border-line">
          {group.rows.map((row, index) => (
            <ActivityLine key={row.id} row={row} divider={index > 0} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Nilai `details` selain label & medan, untuk paparan butiran. */
function detailEntries(details: AdminActivity['details']): [string, string][] {
  if (!details) return [];
  return Object.entries(details)
    .filter(([key, value]) => key !== 'label' && key !== 'diubah' && value !== null && value !== undefined)
    .map(([key, value]) => [
      key.replace(/_/g, ' '),
      typeof value === 'boolean' ? (value ? 'Ya' : 'Tidak') : String(value),
    ]);
}

function ActivityLine({ row, divider }: { row: AdminActivity; divider: boolean }) {
  const [open, setOpen] = useState(false);

  const label = typeof row.details?.label === 'string' ? row.details.label : null;
  // Dalam baris padat, pemisah label ("0145 · NAMA") menjadi ruang supaya
  // tidak bertembung dengan pemisah antara tindakan dan sasaran.
  const shortLabel = label ? label.split(SEP).join(' ') : null;
  const changed = Array.isArray(row.details?.diubah) ? row.details.diubah : [];
  const target = [TARGET_TYPE_LABEL[row.target_type] ?? row.target_type, row.target_id ? '#' + row.target_id.slice(0, 8) : null]
    .filter(Boolean)
    .join(SEP);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={() => setOpen((current) => !current)}
      className={`px-4 py-2.5 active:bg-background ${divider ? 'border-t border-line' : ''}`}>
      <View className="flex-row items-start gap-3">
        <Text className="w-10 pt-px text-xs font-medium text-ink-faint" style={{ fontVariant: ['tabular-nums'] }}>
          {formatTime(row.created_at)}
        </Text>
        <Text className="flex-1 text-sm text-ink" numberOfLines={open ? undefined : 1}>
          <Text className="font-semibold">{row.action}</Text>
          {shortLabel ? <Text className="text-ink-muted">{SEP + shortLabel}</Text> : null}
        </Text>
      </View>

      {open ? (
        <View className="mt-1.5 gap-0.5 pl-[52px]">
          <Text className="text-xs text-ink-muted">{target}</Text>
          {changed.length ? <Text className="text-xs text-ink-muted">Medan: {changed.join(', ')}</Text> : null}
          {detailEntries(row.details).map(([key, value]) => (
            <Text key={key} className="text-xs text-ink-muted">
              {key}: {value}
            </Text>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}
