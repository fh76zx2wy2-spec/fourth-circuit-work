begin;

-- The enrollment verifier receives only the 64 ASCII hex characters of the
-- account HMAC. For those inputs bcrypt 2a and 2b produce the same hash body.
-- Adapt the value for pgcrypto without modifying the Supabase Auth credential.
do $migration$
declare
  definition text := pg_get_functiondef('public.organizer_passkey_server(text,uuid,uuid,jsonb)'::regprocedure);
  old_check text := 'extensions.crypt(account_credential,u.encrypted_password)=u.encrypted_password';
  new_check text := $check$extensions.crypt(account_credential,
        case when left(u.encrypted_password,4)='$2b$' then '$2a$'||substr(u.encrypted_password,5) else u.encrypted_password end)
      = case when left(u.encrypted_password,4)='$2b$' then '$2a$'||substr(u.encrypted_password,5) else u.encrypted_password end$check$;
begin
  if position(old_check in definition) = 0 then
    raise exception 'Expected organizer enrollment verifier was not found';
  end if;
  execute replace(definition,old_check,new_check);
end
$migration$;

commit;
