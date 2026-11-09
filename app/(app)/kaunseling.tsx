import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FormModal } from '@/components/ui/form-modal';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import {
  counselErrorMessage,
  counselorImageUrl,
  educationLines,
  fetchCounselors,
  fetchMyCounselThreads,
  logCounselingContact,
  type Counselor,
  type CounselMyThread,
} from '@/lib/counseling';
import { formatChatTime } from '@/lib/feedback-chat';
import { useGoBack } from '@/lib/navigation';
import { toWhatsAppNumber } from '@/lib/phone';
import { useColors } from '@/lib/theme';

function Avatar({ counselor, size }: { counselor: Counselor; size: number }) {
  const colors = useColors();
  return counselor.gambar_path ? (
    <Image
      source={{ uri: counselorImageUrl(counselor.gambar_path) }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
      transition={150}
      accessibilityLabel={'Gambar ' + counselor.full_name}
    />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2 }} className="items-center justify-center bg-primary-soft">
      <Ionicons name="person-outline" size={Math.round(size * 0.42)} color={colors.primary} />
    </View>
  );
}

/**
 * Bantuan Kaunseling (migration 153) — senarai kaunselor yang dilantik Lajnah Kebajikan.
 * Ketik nama untuk WhatsApp / telefon / mesej dalam app. Ketikan WhatsApp & telefon
 * dicatat (bilangan sahaja kepada LK; identiti hanya kepada kaunselor itu).
 */
export default function KaunselingScreen() {
  const goBack = useGoBack();
  const router = useRouter();
  const colors = useColors();

  const [counselors, setCounselors] = useState<Counselor[] | null>(null);
  const [threads, setThreads] = useState<CounselMyThread[]>([]);
  const [selected, setSelected] = useState<Counselor | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([fetchCounselors(), fetchMyCounselThreads().catch(() => [] as CounselMyThread[])])
        .then(([rows, mine]) => {
          if (!active) return;
          setCounselors(rows);
          setThreads(mine);
          setError(null);
        })
        .catch((caught) => {
          if (!active) return;
          setCounselors((prev) => prev ?? []);
          setError(counselErrorMessage(caught, 'Gagal memuatkan senarai kaunselor.'));
        });
      return () => {
        active = false;
      };
    }, []),
  );

  if (counselors === null) return <LoadingScreen />;

  const contact = (counselor: Counselor, channel: 'whatsapp' | 'telefon') => {
    // Catatan senyap: kegagalan tidak menghalang ahli menghubungi kaunselor.
    void logCounselingContact(counselor.id, channel).catch(() => undefined);
    if (channel === 'whatsapp') {
      const number = toWhatsAppNumber(counselor.no_tel);
      if (number) void Linking.openURL('https://wa.me/' + number).catch(() => setError('WhatsApp tidak dapat dibuka pada peranti ini.'));
    } else if (counselor.no_tel) {
      void Linking.openURL('tel:' + counselor.no_tel.replace(/[^\d+]/g, '')).catch(() =>
        setError('Panggilan telefon tidak dapat dibuat pada peranti ini.'),
      );
    }
  };

  return (
    <Screen padTop={false}>
      <ScreenHeader eyebrow="Lajnah Kebajikan" title="Bantuan Kaunseling" onBackPress={goBack} />

      <View className="gap-4 px-gutter pb-10 pt-5">
        <Notice
          tone="info"
          message="Pilih kaunselor untuk berhubung melalui WhatsApp, telefon atau mesej dalam app. Pihak Lajnah Kebajikan hanya mengetahui bilangan ahli yang menghubungi kaunselor, bukan identiti anda. Hanya kaunselor yang anda hubungi mengetahui siapa anda."
        />

        {error ? <Notice tone="negative" message={error} /> : null}

        {threads.length > 0 ? (
          <View className="gap-2">
            <SectionTitle title="Perbualan Saya" />
            {threads.map((thread) => (
              <Pressable
                key={thread.id}
                accessibilityRole="button"
                accessibilityLabel={'Buka perbualan dengan ' + thread.counselor_name}
                onPress={() =>
                  router.push({ pathname: '/(app)/kaunseling-chat', params: { id: thread.id, n: String(Date.now()) } })
                }
                className="active:opacity-70">
                <Card>
                  <View className="gap-1">
                    <View className="flex-row items-center justify-between gap-2">
                      <Text numberOfLines={1} className="flex-1 text-base font-bold text-ink">
                        {thread.counselor_name}
                      </Text>
                      <Text className="text-xs text-ink-muted">{formatChatTime(thread.last_message_at)}</Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                      <Text
                        numberOfLines={2}
                        className={`flex-1 text-sm ${thread.unread ? 'font-bold text-ink' : 'text-ink-muted'}`}>
                        {(thread.last_sender === 'ahli' ? 'Anda: ' : '') + (thread.last_body ?? '')}
                      </Text>
                      {thread.unread ? <View className="h-2.5 w-2.5 rounded-full bg-negative" /> : null}
                    </View>
                    {!thread.counselor_aktif ? (
                      <Text className="text-xs text-warn">Kaunselor ini tidak aktif</Text>
                    ) : null}
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        ) : null}

        <SectionTitle title="Senarai Kaunselor" />
        {counselors.length === 0 && !error ? (
          <EmptyState
            icon="heart-outline"
            title="Belum ada kaunselor"
            description="Senarai kaunselor akan dipaparkan di sini selepas dilantik oleh Lajnah Kebajikan."
          />
        ) : (
          counselors.map((counselor) => (
            <Pressable
              key={counselor.id}
              accessibilityRole="button"
              accessibilityLabel={'Lihat butiran kaunselor ' + counselor.full_name}
              onPress={() => setSelected(counselor)}
              className="active:opacity-70">
              <Card>
                <View className="flex-row items-center gap-3">
                  <Avatar counselor={counselor} size={56} />
                  <View className="flex-1">
                    <Text className="text-base font-bold text-ink">{counselor.full_name}</Text>
                    {counselor.generasi ? <Text className="text-sm text-ink-muted">{counselor.generasi}</Text> : null}
                    {counselor.pekerjaan ? (
                      <Text numberOfLines={1} className="text-xs text-ink-faint">
                        {counselor.pekerjaan}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
                </View>
              </Card>
            </Pressable>
          ))
        )}
      </View>
      <FormModal visible={selected !== null} title="Butiran Kaunselor" onClose={() => setSelected(null)} centerOnDesktop>
        {selected ? (
          <View className="gap-4">
            <View className="items-center gap-3">
              <Avatar counselor={selected} size={132} />
              <View className="items-center gap-0.5">
                <Text className="text-center text-lg font-bold text-ink">{selected.full_name}</Text>
                {selected.generasi ? <Text className="text-sm text-ink-muted">{selected.generasi}</Text> : null}
              </View>
            </View>

            {educationLines(selected.pendidikan).length > 0 ? (
              <View className="gap-1.5 rounded-field bg-primary-tint p-3">
                <Text className="text-xs font-semibold text-ink-muted">Latar belakang pendidikan</Text>
                {educationLines(selected.pendidikan).map((line, index) => (
                  <View key={index} className="flex-row gap-2">
                    <Text className="text-sm text-ink-muted">{'•'}</Text>
                    <Text className="flex-1 text-sm text-ink">{line}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {selected.pekerjaan ? (
              <View className="gap-1 rounded-field bg-primary-tint p-3">
                <Text className="text-xs font-semibold text-ink-muted">Pekerjaan / jawatan semasa</Text>
                <Text className="text-sm text-ink">{selected.pekerjaan}</Text>
              </View>
            ) : null}

            <View className="gap-2 border-t border-line pt-4">
              {toWhatsAppNumber(selected.no_tel) !== null ? (
                <>
                  <Text selectable className="text-sm text-ink-muted">
                    {'No. telefon: ' + selected.no_tel}
                  </Text>
                  <Button label="WhatsApp" variant="ghost" onPress={() => contact(selected, 'whatsapp')} />
                  <Button label="Telefon" variant="secondary" onPress={() => contact(selected, 'telefon')} />
                </>
              ) : (
                <Text className="text-sm text-ink-muted">Nombor telefon kaunselor ini belum direkodkan.</Text>
              )}
              <Button
                label="Mesej dalam app"
                onPress={() => {
                  const id = selected.id;
                  setSelected(null);
                  router.push({ pathname: '/(app)/kaunseling-chat', params: { counselor: id, n: String(Date.now()) } });
                }}
              />
            </View>
          </View>
        ) : null}
      </FormModal>
    </Screen>
  );
}
