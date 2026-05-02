-- Track every SSO sign-in; new users (no role yet) are flagged is_new_user = true
create table if not exists user_signins (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null,
  email         text        not null,
  display_name  text,
  is_new_user   boolean     not null default false,
  signed_in_at  timestamptz not null default now()
);

create index if not exists user_signins_signed_in_at_idx on user_signins (signed_in_at desc);
create index if not exists user_signins_user_id_idx      on user_signins (user_id);
create index if not exists user_signins_new_idx          on user_signins (is_new_user) where is_new_user = true;

-- Admins can read sign-in logs; service role writes them
alter table user_signins enable row level security;
create policy "Admins can read signins"
  on user_signins for select
  to authenticated
  using (
    exists (
      select 1 from user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role in ('admin', 'moderator', 'owner')
    )
  );
