import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { useMemberAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { fetchGenerations, fetchMembers } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import { generationLabel, type Generation, type MemberSummary, type Option } from '@/types/database';

/** Senarai dipenggal supaya skrin tidak melukis ratusan baris sekaligus. */
const PAGE = 50;

export default function AhliListScreen() {
  const goBack = useGoBack();
  const router = useRouter();
  const { loading: accessLoading, canView, canEdit } = useMemberAccess();

  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [generation, setGeneration] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, gens] = await Promise.all([fetchMembers(), fetchGenerations()]);
      setMembers(rows);
      setGenerations(gens);
      setError(null);
    } catch (caught) {
      setError(toMalayError(caught, 'Gagal memuatkan senarai ahli.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accessLoading || !canView) return;
    void load();
  }, [accessLoading, canView, load]);

  const generationOptions = useMemo<Option<string>[]>(
    () => generations.map((row) => ({ value: row.code, label: row.label })),
    [generations],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return members.filter((member) => {
      if (generation && member.generasi !== generation) return false;
      if (!needle) return true;
      // Cari pada nama DAN nombor ahli — admin selalunya memegang salah satu sahaja.
      return (
        member.full_name.toLowerCase().includes(needle) ||
        (member.nombor_ahli ?? '').toLowerCase().includes(needle)
      );
    });
  }, [generation, members, search]);

  // Tapisan yang berubah mesti mengembalikan senarai ke halaman pertama.
  useEffect(() => {
    setLimit(PAGE);
  }, [search, generation]);

  if (accessLoading) return <LoadingScreen />;

  if (!canView) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Senarai Ahli" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Senarai ahli memerlukan kebenaran melihat pada department JABATAN DATA & SUMBER MANUSIA."
          />
        </View>
      </Screen>
    );
  }

  if (loading) return <LoadingScreen />;

  const visible = filtered.slice(0, limit);

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Admin"
        title="Senarai Ahli"
        subtitle={members.length + ' ahli direkodkan'}
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {error ? <Notice tone="negative" message={error} /> : null}

        {canEdit ? (
          <View className="gap-3">
            <Button label="Tambah Ahli" onPress={() => router.push('/(app)/admin/ahli-tambah')} />
            <Button
              label="Muat Naik Fail Excel"
              variant="secondary"
              onPress={() => router.push('/(app)/admin/ahli-upload')}
            />
          </View>
        ) : null}

        <View className="gap-4">
          <TextField
            label="Cari"
            placeholder="Nama atau nombor ahli"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <PickerField
            label="Tapis mengikut generasi"
            placeholder="Semua generasi"
            value={generation}
            options={generationOptions}
            onChange={setGeneration}
          />
        </View>

        {members.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="Tiada rekod ahli"
            description={
              canEdit
                ? 'Muat naik fail Excel keahlian untuk mengisi senarai ini.'
                : 'Senarai ahli masih kosong. Hubungi admin data untuk mengimportnya.'
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title="Tiada padanan"
            description="Tiada ahli sepadan dengan carian atau tapisan ini. Cuba kata kunci lain."
          />
        ) : (
          <View>
            <SectionTitle
              title={'Keputusan (' + filtered.length + ')'}
              caption="Ketuk satu ahli untuk melihat dan menyunting butiran penuh."
            />

            <View className="gap-3">
              {visible.map((member) => (
                <Pressable
                  key={member.id}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/(app)/admin/ahli-detail', params: { id: member.id } })}
                  className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-card active:opacity-70">
                  <Text className="w-12 text-sm font-bold text-primary">{member.nombor_ahli ?? '—'}</Text>

                  <View className="flex-1">
                    <Text className="text-base font-semibold text-ink" numberOfLines={1}>
                      {member.full_name}
                    </Text>
                    <Text className="mt-0.5 text-xs text-ink-muted" numberOfLines={1}>
                      {generationLabel(member.generasi)}
                      {member.email ? ' · ' + member.email : ' · Tiada emel'}
                    </Text>
                  </View>

                  {member.disekat ? <Badge label="Disekat" tone="negative" /> : null}
                </Pressable>
              ))}
            </View>

            {filtered.length > visible.length ? (
              <View className="mt-4">
                <Button
                  label={'Papar Lagi (' + (filtered.length - visible.length) + ')'}
                  variant="secondary"
                  onPress={() => setLimit((current) => current + PAGE)}
                />
              </View>
            ) : null}
          </View>
        )}
      </View>
    </Screen>
  );
}
