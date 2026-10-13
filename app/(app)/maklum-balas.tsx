import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { ToastBanner } from '@/components/ui/toast';
import {
  CHAT_MAX_LENGTH,
  departmentLabel,
  feedbackErrorMessage,
  fetchFeedbackDepartments,
  fetchMyFeedbackThreads,
  formatChatTime,
  startFeedbackThread,
  type FeedbackDepartment,
  type FeedbackMyThread,
} from '@/lib/feedback-chat';
import { useGoBack } from '@/lib/navigation';
import { useColors } from '@/lib/theme';

/**
 * Maklum Balas gaya chat (migration 151): ahli memilih department, memulakan
 * perbualan, dan membalas semula bila admin department itu menjawab. Maklum
 * balas lama (satu mesej sehala) kekal sebagai arkib Super Admin.
 */
export default function MaklumBalasScreen() {
  const goBack = useGoBack();
  const router = useRouter();
  const colors = useColors();

  const [threads, setThreads] = useState<FeedbackMyThread[] | null>(null);
  const [departments, setDepartments] = useState<FeedbackDepartment[]>([]);
  const [composing, setComposing] = useState(false);
  const [department, setDepartment] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([fetchMyFeedbackThreads(), fetchFeedbackDepartments()])
        .then(([rows, depts]) => {
          if (!active) return;
          setThreads(rows);
          setDepartments(depts);
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

  const options = useMemo(
    () =>
      departments
        .map((row) => ({ value: row.id, label: departmentLabel(row.name) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [departments],
  );

  const start = async () => {
    if (!department || !message.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const id = await startFeedbackThread(department, message);
      setMessage('');
      setDepartment(null);
      setComposing(false);
      router.push({ pathname: '/(app)/maklum-balas-chat', params: { id, n: String(Date.now()) } });
    } catch (caught) {
      setError(feedbackErrorMessage(caught, 'Gagal menghantar maklum balas. Sila cuba lagi.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Direktori"
        title="Maklum Balas"
        subtitle="Berbual terus dengan department pilihan anda"
        onBackPress={goBack}
      />

      <View className="gap-4 px-gutter pb-8 pt-6">
        {error ? <ToastBanner tone="negative" message={error} /> : null}

        {composing ? (
          <Card>
            <View className="gap-3">
              <Text className="text-base font-bold text-ink">Chat baharu</Text>
              <PickerField
                label="Hantar kepada *"
                value={department}
                options={options}
                onChange={setDepartment}
                placeholder="Pilih department"
                clearable={false}
              />
              <TextField
                label="Mesej anda *"
                placeholder="Tulis maklum balas, soalan atau cadangan anda."
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={CHAT_MAX_LENGTH}
                editable={!busy}
              />
              <Button
                label="Mulakan Chat"
                loading={busy}
                disabled={busy || !department || !message.trim()}
                onPress={() => void start()}
              />
              <Button label="Batal" variant="ghost" disabled={busy} onPress={() => setComposing(false)} />
            </View>
          </Card>
        ) : (
          <Button label="Mulakan Chat Baharu" onPress={() => setComposing(true)} />
        )}

        {threads === null ? null : threads.length === 0 ? (
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="Belum ada perbualan"
            description="Pilih department dan hantar mesej pertama anda. Balasan admin dan sejarah chat akan kekal di sini."
          />
        ) : (
          threads.map((thread) => (
            <Pressable
              key={thread.id}
              accessibilityRole="button"
              accessibilityLabel={'Buka chat dengan ' + departmentLabel(thread.department_name)}
              onPress={() =>
                router.push({ pathname: '/(app)/maklum-balas-chat', params: { id: thread.id, n: String(Date.now()) } })
              }
              className="active:opacity-70">
              <Card>
                <View className="flex-row items-center gap-3">
                  <View className="h-11 w-11 items-center justify-center rounded-full bg-primary-soft">
                    <Ionicons name="chatbubbles-outline" size={22} color={colors.primary} />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center justify-between gap-2">
                      <Text numberOfLines={1} className="flex-1 text-sm font-bold text-ink">
                        {departmentLabel(thread.department_name)}
                      </Text>
                      <Text className="text-xs text-ink-muted">{formatChatTime(thread.last_message_at)}</Text>
                    </View>
                    <View className="mt-0.5 flex-row items-center gap-2">
                      <Text
                        numberOfLines={1}
                        className={`flex-1 text-sm ${thread.unread ? 'font-bold text-ink' : 'text-ink-muted'}`}>
                        {(thread.last_sender === 'ahli' ? 'Anda: ' : '') + (thread.last_body ?? '')}
                      </Text>
                      {thread.unread ? <View className="h-2.5 w-2.5 rounded-full bg-negative" /> : null}
                    </View>
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
