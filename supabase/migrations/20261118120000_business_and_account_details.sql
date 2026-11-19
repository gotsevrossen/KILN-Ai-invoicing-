-- Settings: the owner edits the business's details; everyone edits their own name (Nov 18 2026).
--
-- * businesses.email and businesses.address: the business's contact email and mailing address.
--   Only the owner changes them (the existing "owner updates the business" rule).
-- * update_my_name(): a signed-in person changes their own name on the team list. Nobody else's,
--   and not their role or status. Their sign-in email and password are changed through Supabase Auth.

alter table public.businesses add column email text;
alter table public.businesses add constraint businesses_email_format check (
  email is null or (length(email) <= 254 and email ~ '^[^[:space:],;<>@]+@[^[:space:],;<>@]+\.[^[:space:],;<>@]+$')
);
alter table public.businesses add column address text not null default '' check (length(address) <= 300);
alter table public.businesses add constraint businesses_name_length check (length(trim(name)) between 1 and 120) not valid;
alter table public.businesses add constraint businesses_phone_length check (length(phone) <= 40) not valid;

create function public.update_my_name(p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare clean text := trim(coalesce(p_name, ''));
begin
  if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'signed out'; end if;
  if length(clean) < 1 or length(clean) > 120 then raise exception using errcode = '23514', message = 'invalid name'; end if;
  update public.business_members set name = clean where user_id = (select auth.uid());
end $$;

revoke all on function public.update_my_name(text) from public, anon;
grant execute on function public.update_my_name(text) to authenticated;
