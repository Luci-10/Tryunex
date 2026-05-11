-- ============================================================
-- Tryunex — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── 1. TABLES (all tables first, before any policies) ────────────────────────

create table if not exists profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  name              text not null default '',
  email             text not null default '',
  profile_image_url text not null default ''
);

create table if not exists closets (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references profiles(id) on delete cascade,
  name                text not null,
  share_code          text not null unique,
  last_laundry_reset  date not null default current_date
);

create table if not exists closet_members (
  closet_id uuid not null references closets(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  primary key (closet_id, user_id)
);

create table if not exists items (
  id           uuid primary key default gen_random_uuid(),
  closet_id    uuid not null references closets(id) on delete cascade,
  name         text not null,
  type         text not null,
  color        text not null,
  notes        text not null default '',
  image_url    text not null default '',
  status       text not null default 'available' check (status in ('available', 'worn')),
  last_worn_on date,
  created_at   timestamptz not null default now()
);

create table if not exists outfits (
  id                uuid primary key default gen_random_uuid(),
  closet_id         uuid not null references closets(id) on delete cascade,
  occasion          text not null,
  comment           text not null default '',
  chosen_by_user_id uuid references profiles(id),
  item_ids          uuid[] not null default '{}',
  created_at        timestamptz not null default now()
);


-- ── 2. ROW LEVEL SECURITY (enable on all tables) ─────────────────────────────

alter table profiles       enable row level security;
alter table closets        enable row level security;
alter table closet_members enable row level security;
alter table items          enable row level security;
alter table outfits        enable row level security;


-- ── 3. POLICIES ──────────────────────────────────────────────────────────────

-- profiles
create policy "profiles: own row select"
  on profiles for select
  using (
    auth.uid() = id
    or exists (
      select 1 from closet_members cm1
      join closet_members cm2 on cm1.closet_id = cm2.closet_id
      where cm1.user_id = auth.uid() and cm2.user_id = profiles.id
    )
  );

create policy "profiles: own row insert"
  on profiles for insert
  with check (auth.uid() = id);

create policy "profiles: own row update"
  on profiles for update
  using (auth.uid() = id);

-- closets
create policy "closets: member select"
  on closets for select
  using (
    exists (
      select 1 from closet_members
      where closet_id = closets.id and user_id = auth.uid()
    )
  );

create policy "closets: lookup by share code"
  on closets for select
  using (auth.role() = 'authenticated');

create policy "closets: owner insert"
  on closets for insert
  with check (auth.uid() = owner_id);

create policy "closets: member update"
  on closets for update
  using (
    exists (
      select 1 from closet_members
      where closet_id = closets.id and user_id = auth.uid()
    )
  );

-- closet_members
create policy "closet_members: member select"
  on closet_members for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from closet_members cm
      where cm.closet_id = closet_members.closet_id and cm.user_id = auth.uid()
    )
  );

create policy "closet_members: self insert"
  on closet_members for insert
  with check (user_id = auth.uid());

-- items
create policy "items: member select"
  on items for select
  using (
    exists (select 1 from closet_members where closet_id = items.closet_id and user_id = auth.uid())
  );

create policy "items: member insert"
  on items for insert
  with check (
    exists (select 1 from closet_members where closet_id = items.closet_id and user_id = auth.uid())
  );

create policy "items: member update"
  on items for update
  using (
    exists (select 1 from closet_members where closet_id = items.closet_id and user_id = auth.uid())
  );

create policy "items: member delete"
  on items for delete
  using (
    exists (select 1 from closet_members where closet_id = items.closet_id and user_id = auth.uid())
  );

-- outfits
create policy "outfits: member select"
  on outfits for select
  using (
    exists (select 1 from closet_members where closet_id = outfits.closet_id and user_id = auth.uid())
  );

create policy "outfits: member insert"
  on outfits for insert
  with check (
    exists (select 1 from closet_members where closet_id = outfits.closet_id and user_id = auth.uid())
  );


-- ── 4. STORAGE BUCKET ────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('wardrobe', 'wardrobe', true)
on conflict (id) do nothing;

create policy "wardrobe: public read"
  on storage.objects for select
  using (bucket_id = 'wardrobe');

create policy "wardrobe: auth insert"
  on storage.objects for insert
  with check (bucket_id = 'wardrobe' and auth.role() = 'authenticated');

create policy "wardrobe: auth update"
  on storage.objects for update
  using (bucket_id = 'wardrobe' and auth.role() = 'authenticated');

create policy "wardrobe: auth delete"
  on storage.objects for delete
  using (bucket_id = 'wardrobe' and auth.role() = 'authenticated');
