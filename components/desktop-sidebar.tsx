import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { usePermissions } from '@/lib/permissions';

type IconName = keyof typeof Ionicons.glyphMap;

export const SIDEBAR_WIDTH = 260;

type Item = { label: string; href: Href; segment: string; active: IconName; inactive: IconName };

/** Lima destinasi yang sama seperti tab bawah, dalam susunan yang sama. */
const ITEMS: Item[] = [
  { label: 'Utama', href: '/(app)/dashboard', segment: 'dashboard', active: 'home', inactive: 'home-outline' },
  { label: 'Pembayaran', href: '/(app)/pembayaran', segment: 'pembayaran', active: 'card', inactive: 'card-outline' },
  { label: 'Scan', href: '/(app)/usrah-scan', segment: 'usrah-scan', active: 'qr-code', inactive: 'qr-code-outline' },
  { label: 'Ahli', href: '/(app)/ahli', segment: 'ahli', active: 'people', inactive: 'people-outline' },
  { label: 'Profil', href: '/(app)/profil', segment: 'profil', active: 'person-circle', inactive: 'person-circle-outline' },
];

/** Skrin dalam dikira di bawah tab induknya supaya sidebar tidak "kehilangan" kedudukan. */
const PARENT: Record<string, string> = {
  yuran: 'pembayaran',
  pipis: 'pembayaran',
  'adhoc-payment-info': 'pembayaran',
  'ahli-view': 'ahli',
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
      className="border-r border-line bg-surface px-4 py-6"
      style={{ width: SIDEBAR_WIDTH }}
      role="navigation">
      <View className="mb-8 flex-row items-center gap-3 px-2">
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary">
          <Ionicons name="leaf" size={20} color={Colors.white} />
        </View>
        <Text className="text-xl font-bold text-primary">MySAFF</Text>
      </View>

      <View className="flex-1 gap-1">
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

      <View className="gap-1 border-t border-line pt-4">
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
      className={`flex-row items-center gap-3 rounded-xl px-3 py-3 ${
        focused ? 'bg-primary-soft' : 'active:bg-primary-tint hover:bg-primary-tint'
      }`}>
      <Ionicons name={icon} size={20} color={focused ? Colors.primary : Colors.inkMuted} />
      <Text className={`text-[15px] ${focused ? 'font-bold text-primary' : 'font-medium text-ink-muted'}`}>
        {label}
      </Text>
    </Pressable>
  );
}
