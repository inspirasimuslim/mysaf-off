import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { Notice } from '@/components/ui/notice';
import { Colors } from '@/constants/theme';
import {
  fetchLiveAttendance,
  subscribeLiveAttendance,
  type LiveAttendee,
  type LiveStatus,
} from '@/lib/attendance-live';
import { useProgramAccess, useUsrahAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { useResetScrollOnFocus } from '@/lib/scroll-reset';
import { fetchUsrahEvent } from '@/lib/usrah-events';
import { EVENT_TYPE_LABEL, dateRangeLabel, generationLabel, type UsrahEvent } from '@/types/database';

/**
 * Kehadiran Live — dibuka admin semasa program berlangsung.
 *
 * Direka untuk LAPTOP/PROJEKTOR dahulu: kiraan besar yang boleh dibaca dari
 * hujung dewan, dan senarai yang menjadi grid bila skrin lebar. Pada telefon ia
 * menjadi satu lajur biasa. Lebar kandungan dihadkan pada 1100px, bukan 560px
 * seperti skrin lain — skrin ini memang untuk dipapar besar.
 *
 * Kiraan dikemas kini sendiri tanpa refresh: Realtime memberi isyarat bila
 * baris imbasan berubah, dan senarai dibaca semula. Bila saluran Realtime
 * terputus, skrin tidak diam — ia beralih kepada tinjauan berkala dan
 * menyatakannya pada penunjuk status.
 */

const MAX_WIDTH = 1100;
/** Isyarat yang tiba serentak (beberapa ahli mengimbas pada saat yang sama) digabung menjadi satu bacaan. */
const REFRESH_DEBOUNCE_MS = 400;
/** Tinjauan sandaran bila Realtime tidak bersambung. */
const FALLBACK_POLL_MS = 15000;
/** Berapa lama tanda "Baru" kekal pada kehadiran yang baru masuk. */
const FRESH_MS = 10000;

export default function EventAttendanceLiveScreen() {
  const goBack = useGoBack();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const usrahAccess = useUsrahAccess();
  const programAccess = useProgramAccess();
  const accessLoading = usrahAccess.loading || programAccess.loading;

  const [event, setEvent] = useState<UsrahEvent | null>(null);
  const [attendees, setAttendees] = useState<LiveAttendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<LiveStatus>('CONNECTING');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  /** Id yang sudah dilihat — kehadiran di luar set ini ialah yang baru masuk. */
  const seen = useRef<Set<string> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  useResetScrollOnFocus(scrollRef);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const rows = await fetchLiveAttendance(id);

      // Bacaan pertama menetapkan asas; hanya yang masuk SELEPASNYA ditanda baru.
      if (seen.current) {
        const arrivals = rows.filter((row) => !seen.current?.has(row.scan_id)).map((row) => row.scan_id);
        if (arrivals.length) {
          setFresh((current) => new Set([...current, ...arrivals]));
          setTimeout(() => {
            setFresh((current) => {
              const next = new Set(current);
              arrivals.forEach((scanId) => next.delete(scanId));
              return next;
            });
          }, FRESH_MS);
        }
      }
      seen.current = new Set(rows.map((row) => row.scan_id));

      setAttendees(rows);
      setUpdatedAt(new Date());
      setError(null);
    } catch (caught) {
      setError(toMalayError(caught, 'Gagal membaca senarai kehadiran.'));
    }
  }, [id]);

  // --- Muatan awal ------------------------------------------------------------
  useEffect(() => {
    if (!id || accessLoading) return;
    let active = true;

    void (async () => {
      setLoading(true);
      try {
        const row = await fetchUsrahEvent(id);
        if (!active) return;
        setEvent(row);
        if (row) await refresh();
      } catch (caught) {
        if (active) setError(toMalayError(caught, 'Gagal memuatkan acara.'));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [accessLoading, id, refresh]);

  // --- Langganan Realtime -------------------------------------------------------
  useEffect(() => {
    if (!event) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS);
    };

    const unsubscribe = subscribeLiveAttendance(event.id, scheduleRefresh, (next) => {
      setStatus(next);
      // Sambungan (semula) mungkin terlepas imbasan semasa terputus — baca semula.
      if (next === 'SUBSCRIBED') scheduleRefresh();
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [event, refresh]);

  // --- Tinjauan sandaran bila Realtime tidak bersambung ---------------------------
  useEffect(() => {
    if (!event || status === 'SUBSCRIBED') return;
    const interval = setInterval(() => void refresh(), FALLBACK_POLL_MS);
    return () => clearInterval(interval);
  }, [event, refresh, status]);

  if (accessLoading || loading) return <LoadingScreen />;

  const canView = event
    ? event.event_type === 'usrah'
      ? usrahAccess.canView
      : programAccess.canView
    : usrahAccess.canView || programAccess.canView;

  const wide = width >= 900;
  const columns = width >= 1000 ? 3 : width >= 640 ? 2 : 1;
  const live = status === 'SUBSCRIBED';

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1 bg-background"
      contentContainerStyle={{ alignItems: 'center', paddingBottom: insets.bottom + 32 }}
      showsVerticalScrollIndicator={false}>
      <View className="w-full" style={{ maxWidth: MAX_WIDTH }}>
        <ScreenHeader
          eyebrow="Kehadiran Live"
          title={event?.name ?? 'Kehadiran Live'}
          subtitle={event ? EVENT_TYPE_LABEL[event.event_type] + ' · ' + dateRangeLabel(event.start_date, event.end_date) : undefined}
          onBackPress={goBack}
        />

        <View className="gap-5 px-gutter pt-5">
          {error ? <Notice tone="negative" message={error} /> : null}

          {!canView ? (
            <EmptyState
              icon="lock-closed-outline"
              title="Tiada akses"
              description="Kehadiran live memerlukan kebenaran melihat pada LAJNAH TARBIAH (usrah) atau JABATAN SETIAUSAHA (program)."
            />
          ) : !event ? (
            <EmptyState
              icon="alert-circle-outline"
              title="Acara tidak dijumpai"
              description="Acara ini mungkin telah dipadam, atau anda tiada kebenaran melihatnya."
            />
          ) : (
            <>
              {/* --- Kiraan ---------------------------------------------------- */}
              <View className="overflow-hidden rounded-card bg-primary p-card">
                <View className="flex-row flex-wrap items-center justify-between gap-3">
                  <LiveIndicator live={live} />
                  <Text className="text-xs text-white/70">
                    {updatedAt
                      ? 'Dikemas kini ' + updatedAt.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                      : 'Memuatkan...'}
                  </Text>
                </View>

                <View className="mt-3 flex-row flex-wrap items-end gap-x-4">
                  <Text
                    accessibilityLabel={attendees.length + ' hadir'}
                    className="font-bold text-white"
                    style={{ fontSize: wide ? 128 : 72, lineHeight: wide ? 136 : 80, fontVariant: ['tabular-nums'] }}>
                    {attendees.length}
                  </Text>
                  <Text className="pb-3 font-semibold text-white/80" style={{ fontSize: wide ? 36 : 24 }}>
                    Hadir
                  </Text>
                </View>
              </View>

              {!live && status !== 'CONNECTING' ? (
                <View className="gap-3">
                  <Notice
                    tone="warn"
                    message={
                      'Sambungan masa nyata terputus (' +
                      status +
                      '). Senarai masih dikemas kini setiap ' +
                      FALLBACK_POLL_MS / 1000 +
                      ' saat.'
                    }
                  />
                  <Button label="Muat Semula Sekarang" variant="secondary" onPress={() => void refresh()} />
                </View>
              ) : null}

              {/* --- Senarai --------------------------------------------------- */}
              {attendees.length === 0 ? (
                <EmptyState
                  icon="people-outline"
                  title="Belum ada kehadiran"
                  description="Senarai ini dikemas kini sendiri sebaik ahli pertama mengimbas kod QR."
                />
              ) : (
                <View className="flex-row flex-wrap" style={{ marginHorizontal: -6 }}>
                  {attendees.map((row) => (
                    <View key={row.scan_id} style={{ width: `${100 / columns}%`, padding: 6 }}>
                      <AttendeeRow row={row} fresh={fresh.has(row.scan_id)} />
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function LiveIndicator({ live }: { live: boolean }) {
  return (
    <View className="flex-row items-center gap-2 rounded-pill bg-white/15 px-3 py-1">
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: live ? '#4ADE80' : Colors.inkFaint,
        }}
      />
      <Text className="text-xs font-semibold text-white">{live ? 'LIVE' : 'Menyambung...'}</Text>
    </View>
  );
}

function AttendeeRow({ row, fresh }: { row: LiveAttendee; fresh: boolean }) {
  return (
    <View
      className={`flex-row items-center gap-3 rounded-card border p-3 ${fresh ? 'border-primary bg-primary-tint' : 'border-line bg-surface'}`}>
      <MemberAvatar fullName={row.full_name} avatarUrl={row.avatar_url} size={44} />
      <View className="flex-1">
        <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
          {row.full_name}
        </Text>
        <Text className="mt-0.5 text-xs text-ink-muted" numberOfLines={1}>
          {generationLabel(row.generasi) +
            ' · ' +
            new Date(row.scanned_at).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      <View className="items-end gap-1">
        <Badge
          label={row.attendance_mode === 'online' ? 'Online' : 'Bersemuka'}
          tone={row.attendance_mode === 'online' ? 'info' : 'primary'}
        />
        {fresh ? <Badge label="Baru" tone="positive" /> : row.method === 'upload' ? <Badge label="Galeri" tone="neutral" /> : row.method === 'proximity' ? <Badge label="Lokasi" tone="neutral" /> : null}
      </View>
    </View>
  );
}
