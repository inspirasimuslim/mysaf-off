import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { TextField } from '@/components/ui/text-field';
import { Colors } from '@/constants/theme';
import {
  fetchPlaceCoords,
  googleMapsWebConfigured,
  newPlacesSessionToken,
  searchPlaces,
  type Coords,
  type PlaceSuggestion,
} from '@/lib/google-maps';

type Props = {
  onSelect: (coords: Coords, name: string) => void;
  disabled?: boolean;
};

/** Kotak "Cari nama tempat" — Places API (New) REST, sama untuk web dan native. */
export function PlaceSearch({ onSelect, disabled = false }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useRef(newPlacesSessionToken());
  // Selepas memilih cadangan, teks kotak ditetapkan tanpa mencetuskan carian baharu.
  const skipNext = useRef(false);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return undefined;
    }
    const text = query.trim();
    if (text.length < 3 || !googleMapsWebConfigured) {
      setResults([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        setResults(await searchPlaces(text, session.current, controller.signal));
      } catch (caught) {
        if (!controller.signal.aborted) {
          setResults([]);
          setError(caught instanceof Error ? caught.message : 'Carian tempat gagal.');
        }
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const choose = async (item: PlaceSuggestion) => {
    setBusy(true);
    setError(null);
    try {
      const coords = await fetchPlaceCoords(item.placeId, session.current);
      skipNext.current = true;
      setQuery(item.name);
      setResults([]);
      session.current = newPlacesSessionToken();
      onSelect(coords, item.name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal mendapatkan lokasi tempat.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-2">
      <TextField
        label="Cari tempat dalam Maps"
        placeholder="Cari tempat dalam Maps..."
        value={query}
        onChangeText={setQuery}
        editable={!disabled && googleMapsWebConfigured}
        autoCorrect={false}
      />
      {!googleMapsWebConfigured ? (
        <Text className="text-xs text-ink-muted">Carian tempat belum aktif (kunci Google Maps belum dimasukkan).</Text>
      ) : null}
      {busy ? <ActivityIndicator color={Colors.primary} /> : null}
      {error ? <Text className="text-xs text-negative">{error}</Text> : null}
      {results.length > 0 ? (
        <View className="overflow-hidden rounded-field border border-line bg-surface">
          {results.map((item, index) => (
            <Pressable
              key={item.placeId}
              onPress={() => void choose(item)}
              className={`flex-row items-center gap-3 px-4 py-3 ${index > 0 ? 'border-t border-line' : ''}`}
            >
              <Ionicons name="location-outline" size={18} color={Colors.primary} />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text className="text-xs text-ink-muted" numberOfLines={2}>
                  {item.description}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
