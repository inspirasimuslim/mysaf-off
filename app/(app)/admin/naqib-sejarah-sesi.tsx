import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FormModal } from '@/components/ui/form-modal';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { toMalayErrorVerbose } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import {
  fetchAttendanceCandidates,
  fetchAttendanceCounts,
  fetchMadU,
  fetchMyGroups,
  fetchSessions,
  type AttendanceCandidate,
} from '@/lib/perkaderan';
import { fetchSilibus, type SilibusRow } from '@/lib/perkaderan-program';
import type { UsrahGroup, UsrahSession } from '@/types/database';

function dateLabel(value: string): string {
  const parsed = new Date(value + 'T00:00:00');
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('ms-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function groupLabel(group: UsrahGroup): string {
  const ting = group.tingkatan ? group.tingkatan.replace('Tingkatan ', 'T') : null;
  return [group.sekolah, ting, group.no_kumpulan ? 'K' + group.no_kumpulan : null].filter(Boolean).join(' · ');
}

/**
 * Sejarah sesi usrah naqib — VIEW-ONLY. Butiran setiap sesi, bilangan hadir
 * berbanding jumlah mad'u, dan senarai hadir / tidak hadir bila ditekan.
 */
export default function NaqibSejarahSesiScreen() {
  const goBack = useGoBack();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<UsrahGroup[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<UsrahSession[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [totalMadU, setTotalMadU] = useState(0);
  const [silibus, setSilibus] = useState<SilibusRow[]>([]);

  const [viewing, setViewing] = useState<UsrahSession | null>(null);
  const [roster, setRoster] = useState<AttendanceCandidate[] | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const loadGroup = useCallback(async (group: UsrahGroup) => {
    const [sessionRows, madU, silibusRows] = await Promise.all([
      fetchSessions(group.id),
      fetchMadU(group.id),
      fetchSilibus(group.tingkatan),
    ]);
    setSessions(sessionRows);
    setTotalMadU(madU.length);
    setSilibus(silibusRows);
    setCounts(await fetchAttendanceCounts(sessionRows.map((s) => s.id)));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setError(null);
      fetchMyGroups()
        .then(async (mine) => {
          if (!active) return;
          setGroups(mine);
          const current = mine.find((g) => g.id === groupId) ?? mine[0] ?? null;
          setGroupId(current?.id ?? null);
          if (current) await loadGroup(current);
        })
        .catch((caught) => active && setError(toMalayErrorVerbose(caught, 'Gagal memuatkan sejarah sesi.')))
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const pickGroup = useCallback(
    async (next: string | null) => {
      const group = groups.find((g) => g.id === next);
      if (!group) return;
      setGroupId(group.id);
      setLoading(true);
      setError(null);
      try {
        await loadGroup(group);
      } catch (caught) {
        setError(toMalayErrorVerbose(caught, 'Gagal memuatkan sejarah sesi.'));
      } finally {
        setLoading(false);
      }
    },
    [groups, loadGroup],
  );

  const openAttendance = useCallback(async (session: UsrahSession) => {
    setViewing(session);
    setRoster(null);
    setRosterError(null);
    try {
      setRoster(await fetchAttendanceCandidates(session.group_id, session.id));
    } catch (caught) {
      setRosterError(toMalayErrorVerbose(caught, 'Gagal memuatkan kehadiran.'));
    }
  }, []);

  const silibusCodes = useCallback(
    (session: UsrahSession): string[] =>
      (session.silibus_ids ?? [])
        .map((id) => silibus.find((row) => row.id === id))
        .filter((row): row is SilibusRow => Boolean(row))
        .map((row) => 'F' + row.urutan + ' · ' + row.tajuk),
    [silibus],
  );

  const group = groups.find((g) => g.id === groupId) ?? null;
  const hadirList = useMemo(() => (roster ?? []).filter((r) => r.hadir), [roster]);
  const tidakHadirList = useMemo(() => (roster ?? []).filter((r) => !r.hadir), [roster]);

  if (loading && groups.length === 0 && !error) return <LoadingScreen />;

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader eyebrow="Panel Naqib" title="Sejarah Sesi Usrah" subtitle={group ? groupLabel(group) : undefined} onBackPress={goBack} />

        <View className="gap-4 px-gutter pt-6 pb-8">
          {error ? <Text className="text-sm text-negative">{error}</Text> : null}

          {groups.length > 1 ? (
            <PickerField
              label="Kumpulan"
              value={groupId}
              options={groups.map((g) => ({ value: g.id, label: groupLabel(g) }))}
              onChange={(next) => void pickGroup(next)}
            />
          ) : null}

          {!group ? (
            <EmptyState icon="people-outline" title="Tiada kumpulan" description="Anda belum ditetapkan kepada mana-mana kumpulan." />
          ) : loading ? (
            <LoadingScreen />
          ) : sessions.length === 0 ? (
            <EmptyState icon="calendar-outline" title="Belum ada sesi" description="Sesi yang anda rekod akan muncul di sini." />
          ) : (
            <View className="gap-3">
              {sessions.map((session) => {
                const rekod = session.jumlah_rekod != null && session.hadir_rekod != null;
                const hadir = rekod ? (session.hadir_rekod as number) : (counts[session.id] ?? 0);
                const jumlah = rekod ? (session.jumlah_rekod as number) : totalMadU;
                const codes = silibusCodes(session);
                return (
                  <Card key={session.id}>
                    <View className="gap-2">
                      <View className="flex-row items-center justify-between gap-2">
                        <Text className="flex-1 text-base font-semibold text-ink">{dateLabel(session.session_date)}</Text>
                        <Badge
                          label={session.jenis === 'bonding' ? 'Bonding' : 'Fikrah'}
                          tone={session.jenis === 'bonding' ? 'neutral' : 'positive'}
                        />
                      </View>
                      {session.location_text ? <Text className="text-sm text-ink-muted">Tempat: {session.location_text}</Text> : null}
                      {codes.map((code) => (
                        <Text key={code} className="text-sm text-ink">
                          {code}
                        </Text>
                      ))}
                      {session.topik ? <Text className="text-sm text-ink-muted">Tajuk: {session.topik}</Text> : null}
                      {session.refleksi ? <Text className="text-sm text-ink-muted">Ulasan: {session.refleksi}</Text> : null}
                      {rekod ? (
                        <Text className="text-sm font-semibold text-ink">
                          Kehadiran: {hadir}/{jumlah} mad&apos;u
                        </Text>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => void openAttendance(session)}
                          className="self-start rounded-field border border-line bg-surface px-3 py-1.5 active:opacity-70">
                          <Text className="text-sm font-semibold text-primary">
                            Kehadiran: {hadir}/{jumlah} mad&apos;u →
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </Card>
                );
              })}
            </View>
          )}
        </View>
      </Screen>

      <FormModal
        visible={viewing !== null}
        title={viewing ? dateLabel(viewing.session_date) : 'Kehadiran'}
        description="Senarai kehadiran mad'u"
        onClose={() => setViewing(null)}>
        {rosterError ? (
          <Text className="text-sm text-negative">{rosterError}</Text>
        ) : roster === null ? (
          <LoadingScreen />
        ) : (
          <View className="gap-4">
            <View>
              <Text className="text-xs font-semibold uppercase text-ink-faint">{'Hadir (' + hadirList.length + ')'}</Text>
              {hadirList.length === 0 ? (
                <Text className="mt-1 text-sm text-ink-muted">Tiada.</Text>
              ) : (
                hadirList.map((r) => (
                  <Text key={r.mad_u_id} className="mt-1 text-base text-ink">
                    {r.nama}
                  </Text>
                ))
              )}
            </View>
            <View>
              <Text className="text-xs font-semibold uppercase text-ink-faint">{'Tidak hadir (' + tidakHadirList.length + ')'}</Text>
              {tidakHadirList.length === 0 ? (
                <Text className="mt-1 text-sm text-ink-muted">Tiada.</Text>
              ) : (
                tidakHadirList.map((r) => (
                  <Text key={r.mad_u_id} className="mt-1 text-base text-ink-muted">
                    {r.nama}
                  </Text>
                ))
              )}
            </View>
          </View>
        )}
      </FormModal>
    </>
  );
}
