import { useCallback, useState } from 'react';

import { toMalayError } from './errors';
import { TEMPLATES, buildTemplateWorkbook, type TemplateKind } from './excel-templates';
import { deliverWorkbook } from './xlsx-download';

/** Jana template dan serahkan kepada pengguna. Memulangkan nama fail. */
export async function downloadTemplate(kind: TemplateKind): Promise<string> {
  const template = TEMPLATES[kind];
  await deliverWorkbook(buildTemplateWorkbook(kind), template.fileName, template.title);
  return template.fileName;
}

type Report = (banner: { tone: 'info' | 'negative'; message: string }) => void;

/**
 * Butang "Muat Turun Template" bagi satu skrin muat naik.
 *
 * Hasilnya dilaporkan melalui banner skrin itu sendiri dan bukan notis
 * berasingan, jadi skrin tidak mendapat dua tempat yang bersaing untuk mesej.
 */
export function useTemplateDownload(kind: TemplateKind, report: Report) {
  const [busy, setBusy] = useState(false);

  const download = useCallback(async () => {
    if (busy) return;

    setBusy(true);
    try {
      const fileName = await downloadTemplate(kind);
      report({
        tone: 'info',
        message: 'Template ' + fileName + ' sedia. Isi mulai baris 2 dan padam baris contoh sebelum dimuat naik.',
      });
    } catch (caught) {
      report({ tone: 'negative', message: toMalayError(caught, 'Gagal menyediakan template.') });
    } finally {
      setBusy(false);
    }
  }, [busy, kind, report]);

  return { busy, download };
}
