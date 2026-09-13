-- Kod QR acara dijana oleh PANGKALAN DATA semasa INSERT.
--
-- Sebelum ini `qr_token` dijana oleh app (expo-crypto) dan dihantar bersama
-- INSERT. Ia sudah pun berasingan daripada muat naik poster dan kolumnya sudah
-- NOT NULL UNIQUE, jadi tiada acara pernah wujud tanpa token — tetapi
-- kewujudan token masih bergantung pada app menghantar nilai yang betul.
-- Rentetan kosong atau pendek, contohnya, lulus NOT NULL.
--
-- Selepas migration ini:
--   - Trigger BEFORE INSERT menjana UUID rawak bila token tiada, kosong atau
--     terlalu pendek. App tidak lagi menghantar token langsung. Token yang sah
--     (>= 32 aksara) dikekalkan supaya pemulihan daripada sandaran tidak
--     menukar kod QR yang sudah dicetak.
--   - CHECK menolak token kosong/pendek pada INSERT dan UPDATE.
--   - Baris sedia ada yang tidak memenuhi syarat itu dijana semula dahulu.

create or replace function public.set_usrah_event_qr_token()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.qr_token is null or length(btrim(new.qr_token)) < 32 then
    new.qr_token := gen_random_uuid()::text;
  end if;
  return new;
end;
$$;

revoke all on function public.set_usrah_event_qr_token() from public, anon;

drop trigger if exists usrah_events_qr_token on public.usrah_events;
create trigger usrah_events_qr_token
  before insert on public.usrah_events
  for each row execute function public.set_usrah_event_qr_token();

-- Pembaikan data: logik yang sama seperti trigger di atas.
do $$
declare
  v_repaired integer;
begin
  update public.usrah_events
  set qr_token = gen_random_uuid()::text
  where qr_token is null or length(btrim(qr_token)) < 32;

  get diagnostics v_repaired = row_count;
  raise notice 'qr_token dijana semula untuk % acara', v_repaired;
end;
$$;

alter table public.usrah_events alter column qr_token set not null;

alter table public.usrah_events drop constraint if exists usrah_events_qr_token_check;
alter table public.usrah_events
  add constraint usrah_events_qr_token_check check (length(btrim(qr_token)) >= 32);
