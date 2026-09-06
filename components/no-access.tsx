import { View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { useGoBack } from '@/lib/navigation';

/**
 * Skrin "tiada akses" untuk satu halaman tertentu.
 *
 * `app/(app)/admin/_layout.tsx` hanya menapis ahli biasa kerana skrin di
 * bawahnya mempunyai skop berbeza — jadi setiap skrin menyatakan syaratnya
 * sendiri dan memaparkan komponen ini bila syarat itu tidak dipenuhi.
 */
export function NoAccessScreen({ title, description }: { title: string; description: string }) {
  const goBack = useGoBack();

  return (
    <Screen padTop={false}>
      <ScreenHeader title={title} onBackPress={goBack} />
      <View className="px-gutter">
        <EmptyState icon="lock-closed-outline" title="Tiada akses" description={description} />
      </View>
    </Screen>
  );
}

/** Ayat yang digunakan semula oleh setiap skrin khusus Super Admin. */
export const SUPER_ADMIN_ONLY = 'Halaman ini khusus untuk Super Admin sahaja.';
