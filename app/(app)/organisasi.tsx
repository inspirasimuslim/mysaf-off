import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Switch, Text, View } from 'react-native';

import { OrgPositionRow } from '@/components/org-position-row';
import { ScreenHeader } from '@/components/screen-header';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Colors } from '@/constants/theme';
import type { DirectoryMember } from '@/types/database';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { fetchMemberDirectory } from '@/lib/members';
import { fetchOrgChart, groupOrgChart, type OrgPosition, type OrgSection } from '@/lib/org-chart';
import {
  fetchRaisLantikan,
  groupRais,
  perananLabel,
  raisGroupHeading,
  type RaisGroup,
  type RaisLantikan,
} from '@/lib/rais-lantikan';

/**
 * Carta Organisasi 2025/2027 — dibuka kepada semua ahli, paparan sahaja.
 *
 * Senarai berkumpulan dan bukan pokok bercabang: garis penyambung tidak muat
 * pada lebar telefon, sedangkan hierarki dua tahap (bahagian → jawatan) sudah
 * jelas melalui kepala seksyen dan susunan. Setiap bahagian boleh ditutup.
 * Suntingan dibuat di Hub Admin (SETIAUSAHA) — tiada kawalan edit di sini.
 */
export default function OrganisasiScreen() {
  const goBack = useGoBack();
  const router = useRouter();

  const [rows, setRows] = useState<OrgPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [directory, setDirectory] = useState<DirectoryMember[]>([]);
  const [rais, setRais] = useState<RaisLantikan[]>([]);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await fetchOrgChart());
      setError(null);
    } catch (caught) {
      setError(toMalayError(caught, 'Gagal memuatkan carta organisasi.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /*
    Direktori dibaca untuk melengkapkan paparan awam (emel, telefon, status) —
    carta sendiri hanya membawa nama, generasi dan gambar. Kegagalan senyap:
    profil tetap dibuka dengan data carta.
  */
  useEffect(() => {
    void fetchMemberDirectory()
      .then(setDirectory)
      .catch(() => setDirectory([]));
  }, []);

  /* Rais/Raisah dibaca berasingan: kegagalannya tidak patut menyembunyikan carta. */
  useEffect(() => {
    void fetchRaisLantikan()
      .then(setRais)
      .catch(() => setRais([]));
  }, []);

  const openProfile = useCallback(
    (position: OrgPosition) => {
      if (!position.full_name) return;
      const match = directory.find((row) => row.full_name === position.full_name);
      router.push({
        pathname: '/(app)/ahli-view',
        params: {
          nama: position.full_name,
          generasi: match?.generasi ?? position.generasi ?? '',
          emel: match?.email ?? '',
          tel: match?.no_tel ?? '',
          avatar: match?.avatar_url ?? position.avatar_url ?? '',
          pekerjaan: match?.status_pekerjaan ?? '',
          perkahwinan: match?.status_perkahwinan ?? '',
        },
      });
    },
    [directory, router],
  );

  const sections = useMemo<OrgSection[]>(() => groupOrgChart(rows), [rows]);
  const raisGenerasi = useMemo(() => groupRais(rais, 'generasi'), [rais]);
  const raisKawasan = useMemo(() => groupRais(rais, 'kawasan'), [rais]);

  /* Baris Rais/Raisah dipapar guna komponen jawatan yang sama dengan carta. */
  const raisAsPosition = (row: RaisLantikan): OrgPosition => ({
    id: row.id,
    bahagian: row.jenis,
    jawatan: perananLabel(row.peranan),
    display_order: 0,
    member_id: row.member_id,
    full_name: row.full_name,
    generasi: row.generasi,
    avatar_url: row.avatar_url,
  });

  const renderRaisGroups = (jenis: 'generasi' | 'kawasan', groups: RaisGroup[]) => (
    <View className="gap-4">
      {groups.map((group) => (
        <View key={jenis + group.kod} className="gap-3">
          <Text className="text-sm font-semibold text-ink">{raisGroupHeading(jenis, group.kod)}</Text>
          {group.rows.map((row) => (
            <OrgPositionRow key={row.id} position={raisAsPosition(row)} onPress={() => openProfile(raisAsPosition(row))} />
          ))}
        </View>
      ))}
    </View>
  );

  if (loading) return <LoadingScreen />;

  const vacant = rows.filter((row) => !row.member_id).length;

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Sesi 2025/2027"
        title="Carta Organisasi"
        subtitle={
          sections.length + ' bahagian · ' + rows.length + ' jawatan' + (vacant ? ' · ' + vacant + ' kosong' : '')
        }
        onBackPress={goBack}
      />

      <View className="gap-3 px-gutter pb-8 pt-6">
        {error ? <Notice tone="negative" message={error} /> : null}

        {sections.length ? (
          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-bold text-ink">Pengurusan</Text>
              <View className="flex-row items-center gap-2">
                <Text className="text-sm text-ink-muted">Tunjuk semua</Text>
                <Switch
                  value={showAll}
                  onValueChange={setShowAll}
                  trackColor={{ false: Colors.line, true: Colors.primaryMid }}
                  thumbColor={Colors.white}
                  ios_backgroundColor={Colors.line}
                />
              </View>
            </View>
            {/* key bertukar bersama showAll: seksyen dimount semula mengikut defaultOpen. */}
            {sections.map((section) => (
              <CollapsibleSection
                key={section.bahagian + (showAll ? '-open' : '-closed')}
                title={section.bahagian}
                count={section.positions.length}
                defaultOpen={showAll}>
                <View className="gap-3">
                  {section.positions.map((position) => (
                    <OrgPositionRow key={position.id} position={position} onPress={() => openProfile(position)} />
                  ))}
                </View>
              </CollapsibleSection>
            ))}
          </View>
        ) : error ? null : (
          <EmptyState
            icon="git-network-outline"
            title="Carta belum disediakan"
            description="Carta organisasi akan dipapar di sini sebaik sahaja ditetapkan oleh Setiausaha."
          />
        )}

        {raisKawasan.length ? (
          <>
            <View className="my-3 h-px bg-line" />
            <View className="gap-3">
              <Text className="text-lg font-bold text-ink">Usrah Kawasan</Text>
              {renderRaisGroups('kawasan', raisKawasan)}
            </View>
          </>
        ) : null}

        {raisGenerasi.length ? (
          <>
            <View className="my-3 h-px bg-line" />
            <View className="gap-3">
              <Text className="text-lg font-bold text-ink">Generasi</Text>
              {renderRaisGroups('generasi', raisGenerasi)}
            </View>
          </>
        ) : null}
      </View>
    </Screen>
  );
}
