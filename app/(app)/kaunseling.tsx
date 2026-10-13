import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import {
  counselErrorMessage,
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
  const [openId, setOpenId] = useState<string | null>(null);
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
                      <Text className="text-xs text-warn">Kaunselor ini tidak lagi bertugas</Text>
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
          counselors.map((counselor) => {
            const open = openId === counselor.id;
            const hasPhone = toWhatsAppNumber(counselor.no_tel) !== null;
            return (
              <Card key={counselor.id}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  accessibilityLabel={'Kaunselor ' + counselor.full_name}
                  onPress={() => setOpenId(open ? null : counselor.id)}
                  className="flex-row items-center gap-3 active:opacity-70">
                  <View className="h-11 w-11 items-center justify-center rounded-pill bg-primary-soft">
                    <Ionicons name="heart-outline" size={20} color={colors.primary} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-bold text-ink">{counselor.full_name}</Text>
                    {counselor.generasi ? <Text className="text-sm text-ink-muted">{counselor.generasi}</Text> : null}
                  </View>
                  <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkMuted} />
                </Pressable>

                {open ? (
                  <View className="mt-4 gap-2 border-t border-line pt-4">
                    {hasPhone ? (
                      <>
                        <Text selectable className="text-sm text-ink-muted">
                          {'No. telefon: ' + counselor.no_tel}
                        </Text>
                        <Button label="WhatsApp" variant="ghost" onPress={() => contact(counselor, 'whatsapp')} />
                        <Button label="Telefon" variant="secondary" onPress={() => contact(counselor, 'telefon')} />
                      </>
                    ) : (
                      <Text className="text-sm text-ink-muted">Nombor telefon kaunselor ini belum direkodkan.</Text>
                    )}
                    <Button
                      label="Mesej dalam app"
                      onPress={() =>
                        router.push({
                          pathname: '/(app)/kaunseling-chat',
                          params: { counselor: counselor.id, n: String(Date.now()) },
                        })
                      }
                    />
                  </View>
                ) : null}
              </Card>
            );
          })
        )}
      </View>
    </Screen>
  );
}
