import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { FormModal } from '@/components/ui/form-modal';
import { Notice } from '@/components/ui/notice';
import { TextField } from '@/components/ui/text-field';
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
  /** Acara yang hendak dipadam; `null` menutup helaian. */
  event: UsrahEvent | null;
  onClose: () => void;
  onDone: (event: UsrahEvent, result: DeleteEventResult) => void;
  onError: (message: string) => void;
};

/**
 * Pengesahan dua lapis untuk padam acara — sama seperti Padam Ahli: admin mesti
 * MENAIP "PADAM", bukan sekadar menekan Ya.
 */
export function EventDeleteModal({ event, onClose, onDone, onError }: Props) {
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (event) setConfirmText('');
  }, [event]);

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
    <FormModal
      visible={event !== null}
      title="Padam program?"
      description={
        '"' + (event?.name ?? '') + '" akan dipadam kekal bersama posternya. ' +
        'Jika ia sudah ada rekod kehadiran atau RSVP, ia akan diarkibkan dan bukan dipadam, supaya sejarah data kekal.'
      }
      dismissable={!busy}
      onClose={onClose}>
      <Notice tone="warn" message="Taip PADAM di bawah untuk mengesahkan." />

      <TextField
        label="Taip PADAM"
        placeholder="PADAM"
        value={confirmText}
        onChangeText={setConfirmText}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!busy}
      />

      <Button
        label="Padam"
        variant="danger"
        loading={busy}
        disabled={busy || confirmText.trim().toUpperCase() !== 'PADAM'}
        onPress={() => void confirm()}
      />
    </FormModal>
  );
}
