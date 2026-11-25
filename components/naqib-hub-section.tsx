import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { ActionRow } from '@/components/ui/action-row';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { Notice } from '@/components/ui/notice';
import { fetchMyGroups } from '@/lib/perkaderan';

/**
 * Seksyen "Kumpulan Usrah Saya" di Hub Admin — panel naqib sendiri.
 *
 * Hanya dua fungsi: sejarah sesi (view-only) dan rekod sesi baharu. Kumpulan,
 * partner dan mad'u ditetapkan Lajnah Perkaderan sahaja.
 */
export function NaqibHubSection({ defaultOpen }: { defaultOpen: boolean }) {
  const router = useRouter();
  const [groupCount, setGroupCount] = useState<number | null>(null);

  // Hub kekal dalam stack — muat semula setiap kali difokus.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchMyGroups()
        .then((groups) => active && setGroupCount(groups.length))
        .catch(() => active && setGroupCount(0));
      return () => {
        active = false;
      };
    }, []),
  );

  if (groupCount === null) return null;

  return (
    <CollapsibleSection
      variant="plain"
      title="Kumpulan Usrah Saya"
      caption="Kumpulan usrah sekolah yang anda naqibkan."
      count={groupCount}
      defaultOpen={defaultOpen}>
      {groupCount === 0 ? (
        <Notice tone="info" message="Anda belum ditetapkan kepada mana-mana kumpulan. Kumpulan dan mad'u ditetapkan oleh Lajnah Perkaderan." />
      ) : (
        <View className="gap-3">
          <ActionRow
            icon="time-outline"
            title="Sejarah Sesi Usrah"
            subtitle="Tarikh, tempat, silibus, kehadiran mad'u setiap sesi"
            onPress={() => router.push('/(app)/admin/naqib-sejarah-sesi')}
          />
          <ActionRow
            icon="add-circle-outline"
            title="Rekod Sesi Baharu"
            subtitle="Isi laporan usrah dan tanda kehadiran mad'u"
            onPress={() => router.push('/(app)/admin/usrah-session-form')}
          />
        </View>
      )}
    </CollapsibleSection>
  );
}
