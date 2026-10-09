import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormModal } from '@/components/ui/form-modal';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { ToastBanner } from '@/components/ui/toast';
import { useProgramAccess, useUsrahAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import {
  fetchRaisLantikan,
  fetchRaisMemberOptions,
  groupRais,
  perananLabel,
  raisGroupHeading,
  setRaisLantikan,
  type RaisLantikan,
  type RaisMemberOption,
} from '@/lib/rais-lantikan';
import { useColors } from '@/lib/theme';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

const SEARCH_LIMIT = 20;

/**
 * Lantik / tukar Rais dan Raisah -- satu skrin, dua pintu masuk (`?jenis=`):
 *   generasi -> Admin > Setiausaha (department JABATAN SETIAUSAHA)
 *   kawasan  -> Admin > Tarbiah    (department LAJNAH TARBIAH)
 * Super Admin dirangkumi. RPC `set_rais_lantikan()` ialah penentu muktamad
 * (termasuk semakan jantina: Rais = Muslimin, Raisah = Muslimat).
 */
export default function RaisLantikanScreen() {
  const colors = useColors();
  const goBack = useGoBack();
  const params = useLocalSearchParams<{ jenis?: string }>();
  const jenis: 'generasi' | 'kawasan' = params.jenis === 'kawasan' ? 'kawasan' : 'generasi';
  const setiausahaAccess = useProgramAccess();
  const tarbiahAccess = useUsrahAccess();
  const access = jenis === 'kawasan' ? tarbiahAccess : setiausahaAccess;

  const [rows, setRows] = useState<RaisLantikan[]>([]);
  const [options, setOptions] = useState<RaisMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  const [target, setTarget] = useState<RaisLantikan | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const [saving, setSaving] = useState(false);

  const reportError = useCallback((caught: unknown, fallback: string) => {
    setBanner({ tone: 'negative', message: toMalayError(caught, fallback) });
  }, []);

  const load = useCallback(async () => {
    try {
      setRows(await fetchRaisLantikan());
    } catch (caught) {
      reportError(caught, 'Gagal memuatkan senarai Rais/Raisah.');
    }
  }, [reportError]);

  useEffect(() => {
    if (access.loading || !access.canEdit) return;
    void fetchRaisLantikan()
      .then(setRows)
      .catch((caught) => reportError(caught, 'Gagal memuatkan senarai Rais/Raisah.'))
      .finally(() => setLoading(false));
    void fetchRaisMemberOptions()
      .then(setOptions)
      .catch((caught) => reportError(caught, 'Gagal memuatkan senarai ahli.'));
  }, [access.loading, access.canEdit, reportError]);

  const groups = useMemo(() => groupRais(rows, jenis), [rows, jenis]);

  const openEdit = useCallback((row: RaisLantikan) => {
    setBanner(null);
    setTarget(row);
    setSelectedId(row.member_id);
    setTerm('');
  }, []);

  /* Calon: jantina ikut peranan. Tanpa carian, tunjuk ahli generasi/kawasan slot itu dahulu. */
  const candidates = useMemo(() => {
    if (!target) return [];
    const gender = target.peranan === 'rais' ? 'Muslimin' : 'Muslimat';
    const value = term.trim().toLowerCase();
    const pool = options.filter((option) => option.jantina === gender);
    if (value) return pool.filter((option) => option.full_name.toLowerCase().includes(value)).slice(0, SEARCH_LIMIT);
    return pool
      .filter((option) =>
        target.jenis === 'generasi' ? option.generasi === target.kod : option.kawasan_usrah === target.kod,
      )
      .slice(0, SEARCH_LIMIT);
  }, [options, target, term]);

  const selected = options.find((option) => option.id === selectedId) ?? null;

  const save = useCallback(async () => {
    if (!target || saving) return;
    setSaving(true);
    try {
      await setRaisLantikan(target.id, selectedId);
      setBanner({ tone: 'positive', message: 'Lantikan dikemas kini.' });
      setTarget(null);
      await load();
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal mengemas kini lantikan.') });
    } finally {
      setSaving(false);
    }
  }, [load, saving, selectedId, target]);

  if (access.loading) return <LoadingScreen />;
  if (!access.canEdit) {
    return (
      <NoAccessScreen
        title="Rais / Raisah"
        description={
          jenis === 'kawasan'
            ? 'Skrin ini khusus untuk admin Lajnah Tarbiah.'
            : 'Skrin ini khusus untuk admin Jabatan Setiausaha.'
        }
      />
    );
  }
  if (loading) return <LoadingScreen />;

  const renderGroup = (jenis: 'generasi' | 'kawasan', groups: ReturnType<typeof groupRais>) =>
    groups.map((group) => (
      <Card key={jenis + group.kod}>
        <Text className="mb-2 text-sm font-semibold text-ink">{raisGroupHeading(jenis, group.kod)}</Text>
        <View className="gap-2">
          {group.rows.map((row) => (
            <Pressable
              key={row.id}
              accessibilityRole="button"
              accessibilityLabel={'Tukar ' + perananLabel(row.peranan) + ' ' + raisGroupHeading(jenis, group.kod)}
              onPress={() => openEdit(row)}
              className="flex-row items-center gap-3 active:opacity-70">
              {row.full_name ? (
                <MemberAvatar fullName={row.full_name} avatarUrl={row.avatar_url} size={34} />
              ) : (
                <View
                  style={{ width: 34, height: 34, borderRadius: 17 }}
                  className="items-center justify-center bg-background">
                  <Ionicons name="person-outline" size={16} color={colors.inkFaint} />
                </View>
              )}
              <View className="flex-1">
                <Text className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {perananLabel(row.peranan)}
                </Text>
                {row.full_name ? (
                  <Text className="text-base text-ink" numberOfLines={1}>
                    {row.full_name}
                  </Text>
                ) : (
                  <Text className="text-base italic text-ink-faint">Kosong</Text>
                )}
              </View>
              <Ionicons name="pencil-outline" size={18} color={colors.inkMuted} />
            </Pressable>
          ))}
        </View>
      </Card>
    ));

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow={jenis === 'kawasan' ? 'Tarbiah' : 'Setiausaha'}
        title={jenis === 'kawasan' ? 'Rais / Raisah Usrah Kawasan' : 'Rais / Raisah Generasi'}
        subtitle={
          jenis === 'kawasan'
            ? 'Lantik atau tukar Rais dan Raisah bagi setiap kawasan usrah'
            : 'Lantik atau tukar Rais dan Raisah bagi setiap generasi'
        }
        onBackPress={goBack}
      />

      <View className="gap-3 px-gutter pb-8 pt-6">
        {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}
        <Notice
          tone="info"
          message={
            (jenis === 'generasi' ? 'Generasi i01–i06 hanya mempunyai Rais, i19 hanya Raisah. ' : '') +
            'Rais mesti Muslimin dan Raisah mesti Muslimat. Senarai ini dipapar kepada semua ahli di Carta Organisasi.'
          }
        />
        {renderGroup(jenis, groups)}
      </View>

      <FormModal
        visible={target !== null}
        title={target ? perananLabel(target.peranan) + ' — ' + raisGroupHeading(target.jenis, target.kod) : ''}
        onClose={() => setTarget(null)}
        dismissable={!saving}>
        <View className="gap-3">
          {selected ? (
            <View className="flex-row items-center gap-3 rounded-field border border-primary bg-surface p-3">
              <MemberAvatar fullName={selected.full_name} avatarUrl={selected.avatar_url} size={36} />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-ink" numberOfLines={2}>
                  {selected.full_name}
                </Text>
                {selected.generasi ? <Text className="text-xs text-ink-muted">{'Generasi ' + selected.generasi}</Text> : null}
              </View>
              <IconButton icon="close" accessibilityLabel="Buang pilihan ahli" disabled={saving} onPress={() => setSelectedId(null)} />
            </View>
          ) : (
            <Text className="text-sm text-ink-muted">Tiada ahli dipilih — lantikan akan dikosongkan.</Text>
          )}

          <TextField
            label="Cari ahli"
            placeholder={target?.peranan === 'rais' ? 'Taip nama Muslimin' : 'Taip nama Muslimat'}
            value={term}
            onChangeText={setTerm}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving}
            topAnchored
          />
          {!term.trim() ? (
            <Text className="text-xs text-ink-faint">
              {'Dipaparkan: ahli ' + (target?.jenis === 'generasi' ? 'generasi ' : 'kawasan ') + (target?.kod ?? '') + '. Taip nama untuk mencari dalam semua ahli.'}
            </Text>
          ) : null}

          <View className="gap-2">
            {candidates.map((option) => (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityLabel={'Pilih ' + option.full_name}
                disabled={saving}
                onPress={() => setSelectedId(option.id)}
                className={`flex-row items-center gap-3 rounded-field border bg-surface p-3 active:opacity-70 ${
                  option.id === selectedId ? 'border-primary' : 'border-line'
                }`}>
                <MemberAvatar fullName={option.full_name} avatarUrl={option.avatar_url} size={32} />
                <Text className="flex-1 text-sm text-ink" numberOfLines={2}>
                  {option.full_name}
                </Text>
                {option.generasi ? <Text className="text-xs text-ink-faint">{option.generasi}</Text> : null}
              </Pressable>
            ))}
            {candidates.length === 0 ? <Text className="text-sm text-ink-muted">Tiada nama sepadan.</Text> : null}
          </View>

          <Button label="Simpan" onPress={() => void save()} loading={saving} disabled={saving || selectedId === (target?.member_id ?? null)} />
        </View>
      </FormModal>
    </Screen>
  );
}
