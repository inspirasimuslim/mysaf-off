import { Linking, Text, type TextProps } from 'react-native';

/** http(s):// atau www. — berhenti pada ruang putih; tanda baca di hujung dibuang kemudian. */
const URL_PATTERN = /(https?:\/\/[^\s<>]+|www\.[^\s<>]+)/gi;
const TRAILING = /[.,;:!?)\]'"”’]+$/;

type Part = { text: string; url?: string };

export function splitLinks(input: string): Part[] {
  const parts: Part[] = [];
  let last = 0;

  for (const match of input.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    let raw = match[0];
    const trailing = TRAILING.exec(raw)?.[0] ?? '';
    if (trailing) raw = raw.slice(0, raw.length - trailing.length);
    if (!raw) continue;

    if (start > last) parts.push({ text: input.slice(last, start) });
    parts.push({ text: raw, url: /^www\./i.test(raw) ? 'https://' + raw : raw });
    last = start + raw.length;
  }

  if (last < input.length) parts.push({ text: input.slice(last) });
  return parts;
}

/**
 * Teks biasa yang menghidupkan sebarang URL di dalamnya — ketuk untuk buka dalam
 * pelayar. Gunakan untuk kandungan tulisan pengguna (pengumuman, penerangan,
 * dokumen). Props lain `Text` (className, numberOfLines) diteruskan.
 */
export function LinkifiedText({ children, ...rest }: Omit<TextProps, 'children'> & { children?: string | null }) {
  const value = children ?? '';
  const parts = splitLinks(value);

  return (
    <Text {...rest}>
      {parts.map((part, index) =>
        part.url ? (
          <Text
            key={index}
            accessibilityRole="link"
            className="text-primary underline"
            onPress={() => void Linking.openURL(part.url as string).catch(() => undefined)}>
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </Text>
  );
}
