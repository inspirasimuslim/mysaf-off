import { useRouter } from 'expo-router';
import { useCallback } from 'react';

/**
 * Kembali ke skrin sebelum ini, dengan sandaran bila tiada sejarah navigasi —
 * berlaku bila pautan dalam dibuka terus (contoh: refresh halaman di web).
 */
export function useGoBack(fallback: '/(app)/dashboard' = '/(app)/dashboard'): () => void {
  const router = useRouter();

  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  }, [fallback, router]);
}
