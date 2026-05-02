-- Track every failed login attempt (for admin notification log)
create table if not exists login_attempts (
  id           uuid        primary key default gen_random_uuid(),
  ip           text        not null,
  username     text,
  attempted_at timestamptz not null default now()
);

-- Per-IP rate-limit state machine
create table if not exists ip_rate_limits (
  ip             text        primary key,
  fail_count     int         not null default 0,   -- fails in current window
  timeout_count  int         not null default 0,   -- cumulative timeouts (≥2 → perm block)
  locked_until   timestamptz,                       -- null when not in timeout
  is_permanent   boolean     not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Only service role may read/write these tables
alter table login_attempts  enable row level security;
alter table ip_rate_limits  enable row level security;

-- Admins can read (for the admin panel)
create policy "Admins can read login_attempts" on login_attempts
  for select to authenticated
  using (
    exists (
      select 1 from user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role in ('admin', 'moderator', 'owner')
    )
  );

create policy "Admins can read ip_rate_limits" on ip_rate_limits
  for select to authenticated
  using (
    exists (
      select 1 from user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role in ('admin', 'moderator', 'owner')
    )
  );

-- Useful index for the admin notification query
create index if not exists login_attempts_ip_attempted_idx
  on login_attempts (ip, attempted_at desc);
