import { useState } from 'react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toMalayError } from '@/lib/errors';
import { deleteOrArchiveEvent, type DeleteEventResult } from '@/lib/usrah-events';
import type { UsrahEvent } from '@/types/database';

/** Mesej selepas "Padam" — dipadam terus dan diarkib mesti jelas berbeza. */
export function deleteResultMessage(event: UsrahEvent, result: DeleteEventResult): string {
  if (result.outcome === 'deleted') {
    return '"' + event.name + '" telah dipadam terus.';
  }

  const parts = [
    result.attendance ? result.attendance + ' rekod kehadiran' : null,
    result.rsvp ? result.rsvp + ' RSVP' : null,
  ].filter(Boolean);

  return (
    '"' + event.name + '" ada ' + parts.join(' dan ') +
    ' — ia diarkibkan (bukan dipadam terus) untuk kekalkan sejarah data. Hidupkan "Papar Arkib" untuk melihat atau mengeksportnya.'
  );
}

type Props = {
  /** Acara yang hendak dipadam; `null` menutup dialog. */
  event: UsrahEvent | null;
  onClose: () => void;
  onDone: (event: UsrahEvent, result: DeleteEventResult) => void;
  onError: (message: string) => void;
};

/**
 * Pengesahan padam acara — dialog sahkan dua-klik, sama seperti Padam Ahli.
 */
export function EventDeleteModal({ event, onClose, onDone, onError }: Props) {
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!event || busy) return;

    setBusy(true);
    try {
      onDone(event, await deleteOrArchiveEvent(event.id));
    } catch (caught) {
      onError(toMalayError(caught, 'Gagal memadam program.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      visible={event !== null}
      title="Padam program?"
      message={
        '"' + (event?.name ?? '') + '" akan dipadam kekal bersama posternya. ' +
        'Jika ia sudah ada rekod kehadiran atau RSVP, ia akan diarkibkan dan bukan dipadam, supaya sejarah data kekal.'
      }
      confirmLabel="Padam"
      destructive
      busy={busy}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    />
  );
}
