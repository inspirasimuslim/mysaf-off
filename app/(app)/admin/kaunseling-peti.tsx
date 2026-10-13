import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { counselErrorMessage, fetchCounselorThreads, type CounselorThread } from '@/lib/counseling';
import { formatChatTime } from '@/lib/feedback-chat';
import { useGoBack } from '@/lib/navigation';

/**
 * Peti masuk kaunselor (migration 153): hanya perbualan ahli yang menghubungi kaunselor ini.
 * Pangkalan data menentukan siapa kaunselor — bukan admin department, bukan Super Admin.
 */
export default function KaunselingPetiScreen() {
  const goBack = useGoBack();
  const router = useRouter();

  const [threads, setThreads] = useState<CounselorThread[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchCounselorThreads()
        .then((rows) => {
          if (!active) return;
          setThreads(rows);
          setError(null);
        })
        .catch((caught) => {
          if (!active) return;
          setThreads((prev) => prev ?? []);
          setError(counselErrorMessage(caught, 'Gagal memuatkan perbualan.'));
        });
      return () => {
        active = false;
      };
    }, []),
  );

  if (threads === null) return <LoadingScreen />;

  const unread = threads.filter((thread) => thread.unread).length;

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Pentadbiran"
        title="Sesi Kaunseling"
        subtitle={unread > 0 ? unread + ' belum dibaca · ' + threads.length + ' perbualan' : threads.length + ' perbualan'}
        onBackPress={goBack}
      />

      <View className="gap-3 px-gutter pb-8 pt-6">
        <Notice tone="info" message="Perbualan ini sulit — hanya anda yang dapat melihat identiti dan mesej ahli. Lajnah Kebajikan hanya melihat bilangan." />
        {error ? <Notice tone="negative" message={error} /> : null}

        {threads.length === 0 && !error ? (
          <EmptyState
            icon="heart-outline"
            title="Belum ada sesi"
            description="Mesej daripada ahli yang menghubungi anda akan muncul di sini."
          />
        ) : (
          threads.map((thread) => (
            <Pressable
              key={thread.id}
              accessibilityRole="button"
              accessibilityLabel={'Buka perbualan dengan ' + thread.member_name}
              onPress={() =>
                router.push({ pathname: '/(app)/kaunseling-chat', params: { id: thread.id, n: String(Date.now()) } })
              }
              className="active:opacity-70">
              <Card>
                <View className="gap-1">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text numberOfLines={1} className="flex-1 text-base font-bold text-ink">
                      {thread.member_name}
                      {thread.generasi ? '  ·  ' + thread.generasi : ''}
                    </Text>
                    <Text className="text-xs text-ink-muted">{formatChatTime(thread.last_message_at)}</Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Text
                      numberOfLines={2}
                      className={`flex-1 text-sm ${thread.unread ? 'font-bold text-ink' : 'text-ink-muted'}`}>
                      {(thread.last_sender === 'kaunselor' ? 'Anda: ' : '') + (thread.last_body ?? '')}
                    </Text>
                    {thread.unread ? <View className="h-2.5 w-2.5 rounded-full bg-negative" /> : null}
                  </View>
                </View>
              </Card>
            </Pressable>
          ))
        )}
      </View>
    </Screen>
  );
}
