import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import {
  departmentLabel,
  feedbackErrorMessage,
  fetchAdminFeedbackThreads,
  formatChatTime,
  type FeedbackAdminThread,
} from '@/lib/feedback-chat';
import { useGoBack } from '@/lib/navigation';

/**
 * Peti masuk Maklum Balas Ahli (migration 151): perbualan untuk department yang
 * admin boleh lihat (Super Admin: semua). Belum dibaca dahulu. Pangkalan data
 * menapis mengikut kebenaran; perbualan sendiri tidak dipaparkan.
 */
export default function AdminMaklumBalasChatScreen() {
  const goBack = useGoBack();
  const router = useRouter();

  const [threads, setThreads] = useState<FeedbackAdminThread[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchAdminFeedbackThreads()
        .then((rows) => {
          if (!active) return;
          setThreads(rows);
          setError(null);
        })
        .catch((caught) => {
          if (!active) return;
          setThreads((prev) => prev ?? []);
          setError(feedbackErrorMessage(caught, 'Gagal memuatkan perbualan.'));
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
        title="Maklum Balas Ahli"
        subtitle={unread > 0 ? unread + ' belum dibaca · ' + threads.length + ' perbualan' : threads.length + ' perbualan'}
        onBackPress={goBack}
      />

      <View className="gap-3 px-gutter pb-8 pt-6">
        {error ? <Notice tone="negative" message={error} /> : null}

        {threads.length === 0 && !error ? (
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="Belum ada perbualan"
            description="Maklum balas yang dihantar ahli kepada department anda akan muncul di sini."
          />
        ) : (
          threads.map((thread) => (
            <Pressable
              key={thread.id}
              accessibilityRole="button"
              accessibilityLabel={'Buka perbualan dengan ' + thread.member_name}
              onPress={() =>
                router.push({ pathname: '/(app)/maklum-balas-chat', params: { id: thread.id, n: String(Date.now()) } })
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
                  <Text className="text-xs font-bold text-primary">{departmentLabel(thread.department_name)}</Text>
                  <View className="flex-row items-center gap-2">
                    <Text
                      numberOfLines={2}
                      className={`flex-1 text-sm ${thread.unread ? 'font-bold text-ink' : 'text-ink-muted'}`}>
                      {(thread.last_sender === 'admin' ? 'Admin: ' : '') + (thread.last_body ?? '')}
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
