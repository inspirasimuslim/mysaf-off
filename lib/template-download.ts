import { useCallback, useState } from 'react';

import { toMalayError } from './errors';
import { TEMPLATES, buildTemplateWorkbook, type TemplateKind } from './excel-templates';
import type { DeliveryMode } from './file-delivery';
import { deliverWorkbook } from './xlsx-download';

type Report = (banner: { tone: 'info' | 'negative'; message: string }) => void;

/**
 * Butang "Muat Turun Template" bagi satu skrin muat naik.
 *
 * Hasilnya dilaporkan melalui banner skrin itu sendiri dan bukan notis
 * berasingan, jadi skrin tidak mendapat dua tempat yang bersaing untuk mesej.
 */
export function useTemplateDownload(kind: TemplateKind, report: Report) {
  const [busy, setBusy] = useState<DeliveryMode | null>(null);

  const download = useCallback(
    async (mode: DeliveryMode) => {
      if (busy) return;

      setBusy(mode);
      try {
        const template = TEMPLATES[kind];
        const result = await deliverWorkbook(buildTemplateWorkbook(kind), template.fileName, template.title, mode);
        if (result === 'cancelled') {
          report({ tone: 'info', message: 'Simpanan dibatalkan — tiada folder dipilih.' });
          return;
        }
        report({
          tone: 'info',
          message:
            'Template ' +
            template.fileName +
            (result === 'saved' ? ' disimpan ke folder pilihan anda.' : ' sedia.') +
            ' Isi mulai baris 2 dan padam baris contoh sebelum dimuat naik.',
        });
      } catch (caught) {
        report({ tone: 'negative', message: toMalayError(caught, 'Gagal menyediakan template.') });
      } finally {
        setBusy(null);
      }
    },
    [busy, kind, report],
  );

  return { busy, download };
}
