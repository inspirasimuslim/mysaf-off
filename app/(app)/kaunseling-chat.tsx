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
  COUNSEL_MAX_LENGTH,
  counselErrorMessage,
  fetchCounselMessages,
  fetchCounselThreadInfo,
  markCounselRead,
  sendCounselMessage,
  startCounselThread,
  type CounselMessage,
  type CounselThreadInfo,
} from '@/lib/counseling';
import { formatChatTime } from '@/lib/feedback-chat';
import { useGoBack } from '@/lib/navigation';

/** Selang muat semula mesej baharu semasa skrin terbuka (ms). */
const POLL_MS = 10_000;

/**
 * Perbualan kaunseling (migration 153) — dikongsi ahli dan kaunselor. Param `id` = perbualan
 * sedia ada; param `counselor` = mesej pertama kepada kaunselor itu (perbualan dicipta ketika hantar).
 * `key` + `n` memastikan setiap pembukaan segar (skrin tab tersembunyi kekal terpasang).
 */
export default function KaunselingChatScreen() {
  const params = useLocalSearchParams<{ id?: string; counselor?: string; n?: string }>();
  return (
    <ChatContent
      key={(params.id ?? params.counselor ?? '') + '|' + (params.n ?? '')}
      id={params.id}
      counselorId={params.counselor}
    />
  );
}

function ChatContent({ id, counselorId }: { id?: string; counselorId?: string }) {
  const goBack = useGoBack();

  const [threadId, setThreadId] = useState<string | undefined>(id);
  const [info, setInfo] = useState<CounselThreadInfo | null>(null);
  const [messages, setMessages] = useState<CounselMessage[]>([]);
  const [loaded, setLoaded] = useState(!id);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endSignal, setEndSignal] = useState(0);

  const refresh = useCallback(
    async (isActive: () => boolean, tid: string | undefined) => {
      if (!tid) return;
      try {
        const [thread, rows] = await Promise.all([fetchCounselThreadInfo(tid), fetchCounselMessages(tid)]);
        if (!isActive()) return;
        setInfo(thread);
        setMessages((prev) => {
          if (prev.length !== rows.length) setEndSignal((n) => n + 1);
          return rows;
        });
        setError(null);
        void markCounselRead(tid).catch(() => undefined);
      } catch (caught) {
        if (isActive()) setError(counselErrorMessage(caught, 'Gagal memuatkan perbualan.'));
      } finally {
        if (isActive()) setLoaded(true);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const isActive = () => active;
      void refresh(isActive, threadId);
      const timer = threadId ? setInterval(() => void refresh(isActive, threadId), POLL_MS) : undefined;
      return () => {
        active = false;
        if (timer) clearInterval(timer);
      };
    }, [refresh, threadId]),
  );

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (threadId) {
        await sendCounselMessage(threadId, text);
        await refresh(() => true, threadId);
      } else if (counselorId) {
        const created = await startCounselThread(counselorId, text);
        setThreadId(created);
        await refresh(() => true, created);
      }
      setDraft('');
      setEndSignal((n) => n + 1);
    } catch (caught) {
      setError(counselErrorMessage(caught, 'Gagal menghantar mesej. Sila cuba lagi.'));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <LoadingScreen />;

  // Mesej pertama (belum ada perbualan): hanya ruang menulis.
  if (!threadId) {
    return (
      <Screen padTop={false}>
        <ScreenHeader eyebrow="Bantuan Kaunseling" title="Mesej kepada kaunselor" onBackPress={goBack} />
        <View className="gap-3 px-gutter pb-8 pt-5">
          <Notice
            tone="info"
            message="Hanya kaunselor ini yang dapat membaca mesej anda dan mengetahui identiti anda. Pihak Lajnah Kebajikan hanya melihat bilangan ahli yang menghubungi kaunselor."
          />
          {error ? <Notice tone="negative" message={error} /> : null}
          <TextField
            label="Mesej anda"
            placeholder="Tulis mesej..."
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={COUNSEL_MAX_LENGTH}
            editable={!busy}
          />
          <Button label="Hantar" loading={busy} disabled={busy || !draft.trim() || !counselorId} onPress={() => void send()} />
        </View>
      </Screen>
    );
  }

  if (!info) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Bantuan Kaunseling" onBackPress={goBack} />
        <View className="px-gutter pt-5">
          <Notice tone="negative" message={error ?? 'Perbualan tidak dijumpai.'} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padTop={false} scrollEndSignal={endSignal}>
      <ScreenHeader
        eyebrow="Bantuan Kaunseling"
        title={info.counterpart_name}
        subtitle={info.is_member ? 'Kaunselor' : info.counterpart_generasi ?? undefined}
        onBackPress={goBack}
      />

      <View className="gap-3 px-gutter pb-8 pt-5">
        {error ? <Notice tone="negative" message={error} /> : null}

        {messages.map((message) => {
          const mine = info.is_member ? message.sender === 'ahli' : message.sender === 'kaunselor';
          return (
            <View key={message.id} className={mine ? 'items-end' : 'items-start'}>
              <View
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                  mine ? 'rounded-br-md bg-primary' : 'rounded-bl-md border border-line bg-surface'
                }`}>
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
              label={info.is_member ? 'Mesej anda' : 'Balasan anda'}
              placeholder="Tulis mesej..."
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={COUNSEL_MAX_LENGTH}
              editable={!busy}
            />
            <Button label="Hantar" loading={busy} disabled={busy || !draft.trim()} onPress={() => void send()} />
          </View>
        ) : (
          <Notice tone="info" message="Kaunselor ini tidak lagi bertugas, jadi anda tidak boleh membalas perbualan ini." />
        )}
      </View>
    </Screen>
  );
}
