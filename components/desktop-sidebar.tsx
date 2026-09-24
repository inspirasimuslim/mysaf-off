import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { usePermissions } from '@/lib/permissions';

type IconName = keyof typeof Ionicons.glyphMap;

export const SIDEBAR_WIDTH = 232;

type Item = { label: string; href: Href; segment: string; active: IconName; inactive: IconName };

/** Lima destinasi yang sama seperti tab bawah, dalam susunan yang sama. */
const ITEMS: Item[] = [
  { label: 'Utama', href: '/(app)/dashboard', segment: 'dashboard', active: 'home', inactive: 'home-outline' },
  { label: 'Pembayaran', href: '/(app)/pembayaran', segment: 'pembayaran', active: 'card', inactive: 'card-outline' },
  { label: 'Scan', href: '/(app)/usrah-scan', segment: 'usrah-scan', active: 'qr-code', inactive: 'qr-code-outline' },
  { label: 'Ahli', href: '/(app)/ahli', segment: 'ahli', active: 'people', inactive: 'people-outline' },
  { label: 'Arkib', href: '/(app)/arkib-hub', segment: 'arkib-hub', active: 'file-tray-full', inactive: 'file-tray-full-outline' },
];

/** Skrin dalam dikira di bawah tab induknya supaya sidebar tidak "kehilangan" kedudukan. */
const PARENT: Record<string, string> = {
  yuran: 'pembayaran',
  pipis: 'pembayaran',
  'adhoc-payment-info': 'pembayaran',
  'ahli-view': 'ahli',
  album: 'arkib-hub',
  'document-library': 'arkib-hub',
  profil: 'dashboard',
  'ahli-mbm': 'ahli',
  'ahli-rumusan': 'ahli',
  'hari-jadi-bulan': 'dashboard',
  'event-info': 'dashboard',
  'announcement-info': 'dashboard',
};

/**
 * Sidebar tetap di kiri, untuk mod desktop SAHAJA (dipasang oleh `(app)/_layout`).
 * Menggantikan bar tab bawah; navigasi guna router yang sama (`router.navigate`).
 */
export function DesktopSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAdmin, isActiveNaqib } = usePermissions();

  const first = pathname.split('/').filter(Boolean)[0] ?? 'dashboard';
  const current = PARENT[first] ?? first;

  return (
    <View
      className="border-r border-line bg-surface"
      style={{ width: SIDEBAR_WIDTH }}
      role="navigation">
      {/* Kepala sidebar: logo + nama, dipisahkan daripada navigasi oleh garis nipis. */}
      <View className="h-16 flex-row items-center gap-2.5 border-b border-line px-5">
        <View className="h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Ionicons name="leaf" size={17} color={Colors.white} />
        </View>
        <Text className="text-[17px] font-bold tracking-tight text-primary">MySAFF</Text>
      </View>

      <View className="flex-1 gap-0.5 px-3 pt-4">
        {ITEMS.map((item) => (
          <SidebarLink
            key={item.segment}
            label={item.label}
            icon={current === item.segment ? item.active : item.inactive}
            focused={current === item.segment}
            onPress={() => router.navigate(item.href)}
          />
        ))}
      </View>

      <View className="mx-3 gap-0.5 border-t border-line pb-4 pt-3">
        {isAdmin() || isActiveNaqib() ? (
          <SidebarLink
            label="Hub Admin"
            icon="shield-half-outline"
            focused={current === 'admin'}
            onPress={() => router.navigate('/(app)/admin')}
          />
        ) : null}
        <SidebarLink
          label="Tetapan"
          icon="settings-outline"
          focused={current === 'tetapan'}
          onPress={() => router.navigate('/(app)/tetapan')}
        />
      </View>
    </View>
  );
}

function SidebarLink({
  label,
  icon,
  focused,
  onPress,
}: {
  label: string;
  icon: IconName;
  focused: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-lg border-l-[3px] py-2.5 pl-2.5 pr-3 ${
        focused
          ? 'border-primary bg-primary-tint'
          : 'border-transparent active:bg-primary-tint hover:bg-background'
      }`}>
      <Ionicons name={icon} size={18} color={focused ? Colors.primary : Colors.inkMuted} />
      <Text className={`text-sm ${focused ? 'font-semibold text-primary' : 'font-medium text-ink-muted'}`}>
        {label}
      </Text>
    </Pressable>
  );
}
