import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAdminNotifications } from '@/lib/admin-notifications';
import { useColors } from '@/lib/theme';
import { useIsDesktop } from '@/lib/use-desktop';

/** Nombor pada penanda — melebihi 9 dipaparkan "9+" supaya bulatan tidak membesar. */
function badgeText(total: number): string {
  return total > 9 ? '9+' : String(total);
}

/**
 * Penanda merah pada ikon perisai Hub Admin (kepala mobile & sidebar desktop).
 * Tiada apa-apa dipaparkan bila tiada tugasan. Diletakkan secara `absolute`,
 * jadi induknya mesti `relative` (Pressable ikon/baris sedia ada sudah begitu).
 * `inline` = bulatan di dalam baris (sidebar), bukan di penjuru ikon.
 */
export function NotificationBadge({ inline = false }: { inline?: boolean }) {
  const { total } = useAdminNotifications();
  if (total <= 0) return null;
  return (
    <View
      accessibilityLabel={total + ' tugasan menunggu'}
      className={
        inline
          ? 'min-w-[20px] items-center rounded-pill bg-negative px-1.5 py-0.5'
          : 'absolute -right-0.5 -top-0.5 min-w-[18px] items-center justify-center rounded-pill border-2 border-primary bg-negative px-1'
      }>
      <Text className={inline ? 'text-[11px] font-bold text-white' : 'text-[10px] font-bold leading-[13px] text-white'}>
        {badgeText(total)}
      </Text>
    </View>
  );
}

/** Notis tugasan tertunggak di bahagian atas Hub Admin — setiap baris membuka skrin semakannya. */
export function PendingTasksNotice() {
  const colors = useColors();
  const router = useRouter();
  const { items, total } = useAdminNotifications();
  if (items.length === 0) return null;

  return (
    <View className="gap-2 rounded-card border border-negative/30 bg-negative-soft p-3">
      <View className="flex-row items-center gap-2">
        <Ionicons name="alert-circle" size={18} color={colors.negative} />
        <Text className="flex-1 text-sm font-bold text-ink">{total + ' tugasan menunggu tindakan'}</Text>
      </View>
      {items.map((item) => (
        <Pressable
          key={item.kind}
          accessibilityRole="button"
          accessibilityLabel={item.title}
          onPress={() => router.push(item.route as Href)}
          className="flex-row items-center gap-3 rounded-xl bg-surface p-3 active:opacity-70">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-ink">{item.title}</Text>
            <Text className="mt-0.5 text-sm leading-5 text-ink-muted" numberOfLines={2}>
              {item.preview}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Dialog pratonton notifikasi. Dipasang SEKALI (dalam `AppGate`); terbuka sendiri
 * sekali apabila admin masuk dan ada tugasan. Tiada loceng — selepas ditutup,
 * tugasan dilihat melalui penanda pada perisai dan notis di Hub Admin.
 *
 * Kedudukan: kanan atas, berhampiran perisai, pada mobile; di sebelah sidebar pada
 * desktop. Mengetuk satu baris membuka skrin semakannya.
 */
export function NotificationPopover({ sidebarWidth }: { sidebarWidth: number }) {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  const { items, total, open, setOpen } = useAdminNotifications();

  const close = () => setOpen(false);
  const go = (route: string) => {
    close();
    router.navigate(route as Href);
  };

  const placement = desktop
    ? { left: sidebarWidth + 8, bottom: 72, width: 360 }
    : { top: insets.top + 72, right: 16, left: 16, maxWidth: 380, alignSelf: 'flex-end' as const };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <Pressable accessibilityLabel="Tutup notifikasi" className="flex-1 bg-black/30" onPress={close}>
        <Pressable
          // Ketukan di dalam kad tidak menutup dialog.
          onPress={() => undefined}
          className="absolute rounded-card border border-line bg-surface p-4"
          style={placement}>
          <View className="flex-row items-center gap-2">
            <Ionicons name="notifications" size={18} color={colors.primary} />
            <Text className="flex-1 text-base font-bold text-ink">Notifikasi</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Tutup" hitSlop={10} onPress={close}>
              <Ionicons name="close" size={20} color={colors.inkMuted} />
            </Pressable>
          </View>

          {items.length === 0 ? (
            <View className="items-center gap-2 py-6">
              <Ionicons name="checkmark-circle-outline" size={32} color={colors.positive} />
              <Text className="text-sm text-ink-muted">Tiada tugasan tertunggak.</Text>
            </View>
          ) : (
            <ScrollView className="mt-3" style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
              <Text className="text-xs text-ink-muted">{total + ' perkara menunggu tindakan anda'}</Text>
              {items.map((item) => (
                <Pressable
                  key={item.kind}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                  onPress={() => go(item.route)}
                  className="flex-row items-start gap-3 rounded-xl bg-background p-3 active:opacity-70">
                  <View className="mt-1 h-2.5 w-2.5 rounded-pill bg-negative" />
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-ink">{item.title}</Text>
                    <Text className="mt-0.5 text-sm leading-5 text-ink-muted" numberOfLines={3}>
                      {item.preview}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
