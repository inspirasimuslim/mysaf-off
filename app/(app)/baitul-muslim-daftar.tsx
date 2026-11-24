import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { MBM, MBM_SERIF, MbmGoldButton, MbmGreen } from '@/components/mbm-ui';
import { ScreenHeader } from '@/components/screen-header';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/lib/auth-context';
import { toMalayError } from '@/lib/errors';
import { fetchMyMbmApplication, MBM_PANEL, submitMbm, type MbmMyApplication } from '@/lib/mbm-borang';
import { fetchMyMemberLinked } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';

/**
 * Borang kecenderungan awal ahli untuk berMBM. Nama, generasi dan nombor telefon
 * diisi daripada profil (boleh diubah). Hantar semula sebelum disemak admin
 * mengemas kini permohonan yang sama, tidak menggandakannya.
 */
export default function BaitulMuslimDaftarScreen() {
  const goBack = useGoBack();
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;

  const [loading, setLoading] = useState(true);
  const [noMember, setNoMember] = useState(false);
  const [nama, setNama] = useState('');
  const [generasi, setGenerasi] = useState('');
  const [telefon, setTelefon] = useState('');
  const [panel, setPanel] = useState<string | null>(null);
  const [existing, setExisting] = useState<MbmMyApplication | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void (async () => {
      try {
        const [member, mine] = await Promise.all([fetchMyMemberLinked(userId), fetchMyMbmApplication()]);
        if (!active) return;
        if (!member) {
          setNoMember(true);
          return;
        }
        setNama(member.full_name ?? '');
        setGenerasi(member.generasi ?? '');
        setTelefon(member.no_tel ?? '');
        setExisting(mine);
        if (mine?.status === 'baharu') setPanel(mine.panel_pilihan);
      } catch (caught) {
        if (active) setError(toMalayError(caught, 'Gagal memuatkan borang.'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const submit = async () => {
    if (busy) return;
    if (!nama.trim() || !telefon.trim() || !panel) {
      setError('Sila isi Nama, No Telefon dan pilih Panel Pilihan.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submitMbm({ nama, generasi, no_telefon: telefon, panel });
      setDone(true);
    } catch (caught) {
      setError(toMalayError(caught, 'Gagal menghantar borang.'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingScreen />;

  return (
    <Screen padTop={false}>
      <ScreenHeader title="Daftar Sekarang" onBackPress={goBack} />

      <MbmGreen>
        <View className="items-center px-6 pb-6 pt-5">
          <Text accessibilityRole="header" style={{ fontFamily: MBM_SERIF, fontSize: 26, color: '#fff', textAlign: 'center' }}>
            Majlis Baitul Muslim Ikhwan
          </Text>
          <Text style={{ color: '#DDEDE8', fontSize: 13, marginTop: 4, textAlign: 'center' }}>
            Borang kecenderungan awal ahli untuk berMBM
          </Text>
        </View>
      </MbmGreen>

      <View style={{ backgroundColor: MBM.ivory }} className="gap-4 px-6 py-6 pb-10">
        {noMember ? (
          <Notice tone="warn" message="Akaun anda belum dipautkan kepada rekod ahli, jadi borang tidak boleh dihantar." />
        ) : done ? (
          <View style={{ backgroundColor: '#fff', borderWidth: 2, borderColor: MBM.gold, borderRadius: 22, padding: 22, alignItems: 'center', gap: 10 }}>
            <Ionicons name="checkmark-circle" size={44} color={MBM.emerald} />
            <Text style={{ fontFamily: MBM_SERIF, fontSize: 20, color: MBM.emerald, textAlign: 'center' }}>Borang telah dihantar</Text>
            <Text style={{ color: MBM.ink, fontSize: 14, textAlign: 'center', lineHeight: 21 }}>
              {'Panel pilihan anda: ' + panel}
            </Text>
            <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
              <MbmGoldButton label="Kembali" onPress={() => router.replace('/(app)/baitul-muslim')} />
            </View>
          </View>
        ) : (
          <>
            {existing?.status === 'baharu' ? (
              <Notice tone="info" message={'Anda sudah menghantar borang kepada ' + existing.panel_pilihan + '. Menghantar semula akan mengemas kini permohonan yang sama.'} />
            ) : null}
            {error ? <Notice tone="negative" message={error} /> : null}

            <TextField label="Nama" value={nama} onChangeText={setNama} autoCapitalize="words" editable={!busy} />
            <TextField label="Generasi" value={generasi} onChangeText={setGenerasi} autoCapitalize="none" editable={!busy} />
            <TextField label="No Telefon" value={telefon} onChangeText={setTelefon} keyboardType="phone-pad" editable={!busy} />

            <View accessibilityRole="radiogroup" className="gap-2">
              <Text style={{ color: MBM.emerald, fontWeight: '700', fontSize: 13.5 }}>Panel Pilihan</Text>
              {MBM_PANEL.map((name) => {
                const selected = panel === name;
                return (
                  <Pressable
                    key={name}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: busy }}
                    disabled={busy}
                    onPress={() => setPanel(name)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: selected ? MBM.emerald : '#D8C9A0',
                      backgroundColor: selected ? '#E6F1ED' : '#fff',
                    }}>
                    <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={MBM.emerald} />
                    <Text style={{ flex: 1, color: MBM.ink, fontSize: 14, fontWeight: selected ? '700' : '400' }}>{name}</Text>
                  </Pressable>
                );
              })}
            </View>

            <MbmGoldButton label={busy ? 'Menghantar…' : 'Submit'} disabled={busy} onPress={() => void submit()} />
          </>
        )}
      </View>
    </Screen>
  );
}
