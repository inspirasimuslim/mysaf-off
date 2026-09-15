import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { OrgPositionRow } from '@/components/org-position-row';
import { ScreenHeader } from '@/components/screen-header';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { fetchOrgChart, groupOrgChart, type OrgPosition, type OrgSection } from '@/lib/org-chart';

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

  const [rows, setRows] = useState<OrgPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const sections = useMemo<OrgSection[]>(() => groupOrgChart(rows), [rows]);

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
          sections.map((section) => (
            <CollapsibleSection
              key={section.bahagian}
              title={section.bahagian}
              count={section.positions.length}
              defaultOpen>
              {section.positions.map((position) => (
                <OrgPositionRow key={position.id} position={position} />
              ))}
            </CollapsibleSection>
          ))
        ) : error ? null : (
          <EmptyState
            icon="git-network-outline"
            title="Carta belum disediakan"
            description="Carta organisasi akan dipapar di sini sebaik sahaja ditetapkan oleh Setiausaha."
          />
        )}
      </View>
    </Screen>
  );
}
