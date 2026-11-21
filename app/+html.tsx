import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Dokumen HTML akar untuk web. Menambah ikon skrin utama (apple-touch-icon,
 * manifest) supaya pintasan "Tambah ke Skrin Utama" memaparkan logo MySAFF —
 * favicon lutsinar sahaja menghasilkan jubin kosong.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ms">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="application-name" content="MySAFF" />
        <meta name="apple-mobile-web-app-title" content="MySAFF" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#FFFFFF" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
