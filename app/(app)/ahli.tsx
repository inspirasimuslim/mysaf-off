import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { BIRTHDAY_GOLD, Colors } from '@/constants/theme';
import { useMemberAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { fetchMemberDirectory, fetchMembers } from '@/lib/members';
import { generationLabel, generationOrder, type DirectoryMember } from '@/types/database';

const CARD_WIDTH = 96;
const AVATAR_SIZE = 64;

type Group = { code: string | null; members: DirectoryMember[] };

/**
 * Direktori ahli — tab "Ahli".
 *
 * Senarai penuh dibaca melalui `list_members_directory()`, yang mendedahkan
 * lapan kolum sahaja kepada semua pengguna yang log masuk. RLS pada `members`
 * tidak dilonggarkan; skrin ini tidak pernah melakukan `select` ke table itu.
 *
 * Ketukan pada kad bercabang mengikut kebenaran: admin department dibawa ke
 * skrin butiran penuh yang sedia ada, ahli biasa ke paparan terhad.
 */
export default function AhliScreen() {
  const router = useRouter();
  const { loading: accessLoading, canView } = useMemberAccess();

  const [members, setMembers] = useState<DirectoryMember[]>([]);
  /**
   * `nombor_ahli` → `id`, dibaca melalui RLS dan HANYA untuk admin.
   * Direktori sengaja tidak mendedahkan `id`, jadi ini satu-satunya cara
   * membuka skrin butiran tanpa melebarkan apa yang dilihat ahli biasa.
   */
  const [idByNumber, setIdByNumber] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (accessLoading) return;
    let active = true;

    void (async () => {
      setLoading(true);
      try {
        const directory = await fetchMemberDirectory();
        if (!active) return;
        setMembers(directory);
        setError(null);

        if (canView) {
          // Kegagalan di sini tidak boleh mengosongkan direktori yang sudah
          // dibaca — kesannya hanya ketukan kad kembali ke paparan terhad.
          try {
            const rows = await fetchMembers();
            if (!active) return;
            const pairs = rows
              .filter((row) => row.nombor_ahli)
              .map((row) => [row.nombor_ahli as string, row.id] as const);
            setIdByNumber(new Map(pairs));
          } catch {
            if (active) setIdByNumber(new Map());
          }
        }
      } catch (caught) {
        if (active) setError(toMalayError(caught, 'Gagal memuatkan direktori ahli.'));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [accessLoading, canView]);

  const groups = useMemo<Group[]>(() => {
    const term = search.trim().toLowerCase();
    const matched = term ? members.filter((row) => row.full_name.toLowerCase().includes(term)) : members;

    const byGeneration = new Map<string | null, DirectoryMember[]>();
    matched.forEach((row) => {
      const bucket = byGeneration.get(row.generasi);
      if (bucket) bucket.push(row);
      else byGeneration.set(row.generasi, [row]);
    });

    return [...byGeneration.entries()]
      .map(([code, rows]) => ({
        code,
        members: [...rows].sort((a, b) => a.full_name.localeCompare(b.full_name, 'ms', { sensitivity: 'base' })),
      }))
      .sort((a, b) => generationOrder(a.code) - generationOrder(b.code));
  }, [members, search]);

  const open = useCallback(
    (member: DirectoryMember) => {
      const id = member.nombor_ahli ? idByNumber.get(member.nombor_ahli) : undefined;

      // Admin department mendapat skrin butiran penuh yang sedia ada; skrin itu
      // sendiri yang menentukan sama ada borangnya boleh disunting.
      if (canView && id) {
        router.push({ pathname: '/(app)/admin/ahli-detail', params: { id } });
        return;
      }

      router.push({
        pathname: '/(app)/ahli-view',
        params: {
          nama: member.full_name,
          generasi: member.generasi ?? '',
          emel: member.email ?? '',
          tel: member.no_tel ?? '',
          avatar: member.avatar_url ?? '',
          pekerjaan: member.status_pekerjaan ?? '',
          perkahwinan: member.status_perkahwinan ?? '',
        },
      });
    },
    [canView, idByNumber, router],
  );

  if (accessLoading || loading) return <LoadingScreen />;

  const total = members.length;
  const shown = groups.reduce((sum, group) => sum + group.members.length, 0);

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Direktori"
        title="Ahli"
        subtitle={search.trim() ? shown + ' daripada ' + total + ' ahli' : total + ' ahli direkodkan'}
      />

      <View className="gap-6 px-gutter pt-6">
        {error ? <Notice tone="negative" message={error} /> : null}

        {/*
          Tiga pintu, kesemuanya dibuka kepada semua ahli: rumusan agregat
          (tiada data individu), carta organisasi (maklumat terbuka), dan
          senarai pasangan Ahli MBM (lapan field terhad, lihat `ahli-mbm.tsx`).
        */}
        <View className="flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Rumusan Keseluruhan Ahli"
            onPress={() => router.push('/(app)/ahli-rumusan')}
            className="flex-1 gap-2 rounded-card border border-line bg-surface p-4 active:opacity-70">
            <View className="h-11 w-11 items-center justify-center rounded-pill bg-primary-soft">
              <Ionicons name="stats-chart" size={20} color={Colors.primary} />
            </View>
            <Text className="text-sm font-semibold leading-5 text-ink">Rumusan Keseluruhan Ahli</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Organisasi 2025/2027"
            onPress={() => router.push('/(app)/organisasi')}
            className="flex-1 gap-2 rounded-card border border-line bg-surface p-4 active:opacity-70">
            <View className="h-11 w-11 items-center justify-center rounded-pill bg-primary-soft">
              <Ionicons name="git-network" size={20} color={Colors.primary} />
            </View>
            <Text className="text-sm font-semibold leading-5 text-ink">Organisasi 2025/2027</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ahli MBM"
          onPress={() => router.push('/(app)/ahli-mbm')}
          className="flex-row items-center gap-4 rounded-card border border-line bg-surface p-4 active:opacity-70">
          <View className="h-11 w-11 items-center justify-center rounded-pill bg-primary-soft">
            <Ionicons name="heart" size={20} color={Colors.primary} />
          </View>
          <Text className="flex-1 text-sm font-semibold leading-5 text-ink">Ahli MBM</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.inkFaint} />
        </Pressable>

        {/*
          Pintu ketiga, selebar baris penuh dan bukan sebahagian daripada
          pasangan di atas: dua yang itu membuka data ahli, yang ini ucapan.
          Ikonnya emas atas sebab yang sama seperti ucapan di skrin Utama.
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hari Jadi Bulan Ini"
          onPress={() => router.push('/(app)/hari-jadi-bulan')}
          className="flex-row items-center gap-4 rounded-card border border-line bg-surface p-4 active:opacity-70">
          <View
            className="h-11 w-11 items-center justify-center rounded-pill"
            style={{ backgroundColor: BIRTHDAY_GOLD + '1A' }}>
            <Ionicons name="gift" size={20} color={BIRTHDAY_GOLD} />
          </View>
          <Text className="flex-1 text-sm font-semibold leading-5 text-ink">Hari Jadi Bulan Ini</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.inkFaint} />
        </Pressable>

        <TextField
          label="Cari"
          placeholder="Nama ahli"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {groups.length ? (
        <View className="gap-8 pb-8 pt-6">
          {groups.map((group) => (
            <View key={group.code ?? 'tiada'} className="gap-3">
              <View className="px-gutter">
                <View className="flex-row items-baseline gap-2">
                  <Text className="text-base font-bold text-ink">
                    {group.code ? 'Generasi ' + group.code : 'Tanpa generasi'}
                  </Text>
                  <Text className="text-sm text-ink-muted">{'· ' + group.members.length + ' ahli'}</Text>
                </View>
                <Text className="mt-0.5 text-sm text-ink-faint">{generationLabel(group.code)}</Text>
              </View>

              {/*
                Satu baris melintang setiap generasi. `FlatList` dipilih supaya
                generasi besar tidak membina ratusan kad sekali gus.
              */}
              <FlatList
                horizontal
                data={group.members}
                keyExtractor={(item, index) => (item.nombor_ahli ?? 'x') + ':' + index}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
                renderItem={({ item }) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={item.full_name}
                    onPress={() => open(item)}
                    style={{ width: CARD_WIDTH }}
                    className="items-center gap-2 rounded-card border border-line bg-surface p-3 active:opacity-70">
                    <MemberAvatar fullName={item.full_name} avatarUrl={item.avatar_url} size={AVATAR_SIZE} />
                    {/*
                      Dua baris, kemudian dipotong — nama panjang tidak boleh
                      menolak tinggi kad dan merosakkan barisan.
                    */}
                    <Text className="text-center text-xs font-semibold leading-4 text-ink" numberOfLines={2}>
                      {item.full_name}
                    </Text>
                  </Pressable>
                )}
              />
            </View>
          ))}
        </View>
      ) : (
        <View className="px-gutter pt-6">
          <EmptyState
            icon="search-outline"
            title={search.trim() ? 'Tiada nama sepadan' : 'Tiada rekod ahli'}
            description={
              search.trim()
                ? 'Cuba ejaan lain atau sebahagian nama sahaja.'
                : 'Direktori masih kosong. Rekod ahli diimport melalui panel admin.'
            }
          />
        </View>
      )}
    </Screen>
  );
}
