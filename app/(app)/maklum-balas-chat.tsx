import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import {
  CHAT_MAX_LENGTH,
  departmentLabel,
  feedbackErrorMessage,
  fetchFeedbackMessages,
  fetchFeedbackThreadInfo,
  formatChatTime,
  markFeedbackRead,
  sendFeedbackMessage,
  type FeedbackMessage,
  type FeedbackThreadInfo,
} from '@/lib/feedback-chat';
import { useGoBack } from '@/lib/navigation';

/** Selang muat semula mesej baharu semasa skrin chat terbuka (ms). */
const POLL_MS = 10_000;

/**
 * Skrin perbualan — dikongsi ahli dan admin (migration 151). Pangkalan data
 * menentukan siapa boleh melihat / membalas; skrin ini hanya bertanya.
 * `key` + `n` memastikan setiap pembukaan segar (skrin tab tersembunyi kekal terpasang).
 */
export default function MaklumBalasChatScreen() {
  const params = useLocalSearchParams<{ id?: string; n?: string }>();
  return <ChatContent key={(params.id ?? '') + '|' + (params.n ?? '')} id={params.id} />;
}

function ChatContent({ id }: { id?: string }) {
  const goBack = useGoBack();

  const [info, setInfo] = useState<FeedbackThreadInfo | null>(null);
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endSignal, setEndSignal] = useState(0);

  const refresh = useCallback(
    async (isActive: () => boolean) => {
      if (!id) return;
      try {
        const [thread, rows] = await Promise.all([fetchFeedbackThreadInfo(id), fetchFeedbackMessages(id)]);
        if (!isActive()) return;
        setInfo(thread);
        setMessages((prev) => {
          if (prev.length !== rows.length) setEndSignal((n) => n + 1);
          return rows;
        });
        setError(null);
        void markFeedbackRead(id).catch(() => undefined);
      } catch (caught) {
        if (isActive()) setError(feedbackErrorMessage(caught, 'Gagal memuatkan perbualan.'));
      } finally {
        if (isActive()) setLoaded(true);
      }
    },
    [id],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const isActive = () => active;
      void refresh(isActive);
      const timer = setInterval(() => void refresh(isActive), POLL_MS);
      return () => {
        active = false;
        clearInterval(timer);
      };
    }, [refresh]),
  );

  const send = async () => {
    const text = draft.trim();
    if (!id || !text || busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendFeedbackMessage(id, text);
      setDraft('');
      await refresh(() => true);
      setEndSignal((n) => n + 1);
    } catch (caught) {
      setError(feedbackErrorMessage(caught, 'Gagal menghantar mesej. Sila cuba lagi.'));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <LoadingScreen />;

  if (!info) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Maklum Balas" onBackPress={goBack} />
        <View className="px-gutter pt-5">
          <Notice tone="negative" message={error ?? 'Perbualan tidak dijumpai.'} />
        </View>
      </Screen>
    );
  }

  const title = info.is_owner ? departmentLabel(info.department_name) : info.member_name;
  const subtitle = info.is_owner
    ? 'Perbualan dengan admin department'
    : (info.generasi ? info.generasi + ' · ' : '') + departmentLabel(info.department_name);

  return (
    <Screen padTop={false} scrollEndSignal={endSignal}>
      <ScreenHeader eyebrow="Maklum Balas" title={title} subtitle={subtitle} onBackPress={goBack} />

      <View className="gap-3 px-gutter pb-8 pt-5">
        {error ? <Notice tone="negative" message={error} /> : null}

        {messages.map((message) => {
          const mine = info.is_owner ? message.sender === 'ahli' : message.sender === 'admin';
          return (
            <View key={message.id} className={mine ? 'items-end' : 'items-start'}>
              <View
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                  mine ? 'rounded-br-md bg-primary' : 'rounded-bl-md border border-line bg-surface'
                }`}>
                {!mine ? <Text className="mb-0.5 text-xs font-bold text-primary">{message.sender_name}</Text> : null}
                <Text className={`text-sm leading-5 ${mine ? 'text-white' : 'text-ink'}`} selectable>
                  {message.body}
                </Text>
              </View>
              <Text className="mt-1 px-1 text-xs text-ink-muted">{formatChatTime(message.created_at)}</Text>
            </View>
          );
        })}

        {info.can_reply ? (
          <View className="mt-2 gap-3">
            <TextField
              label={info.is_owner ? 'Mesej anda' : 'Balasan anda'}
              placeholder="Tulis mesej..."
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={CHAT_MAX_LENGTH}
              editable={!busy}
            />
            <Button label="Hantar" loading={busy} disabled={busy || !draft.trim()} onPress={() => void send()} />
          </View>
        ) : (
          <Notice tone="info" message="Anda hanya boleh melihat perbualan ini (tiada kebenaran membalas)." />
        )}
      </View>
    </Screen>
  );
}
