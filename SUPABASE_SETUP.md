# Supabase Setup (URGENT VERIFICATION)
If sending messages fails, you likely missed Phase 2.

## 0. Verify Database Schema
Run this SQL in the **SQL Editor** to verify your columns exist:

```sql
select column_name 
from information_schema.columns 
where table_schema = 'public' 
and table_name = 'messages';
```

You **MUST** see `sender_id` and `receiver_id` in the results. If not, follow instructions below.

# Supabase Setup - Phase 2 (Required for Private Chat)

We need a public table to list users because `auth.users` is private.

```sql
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  status text default 'online',
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Allow all authenticated users to read profiles
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using ( true );

-- Users can update their own profile
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using ( auth.uid() = id )
  with check ( auth.uid() = id );
```

### Auto-create profile on signup

Run this block separately if possible to avoid parser issues:

```sql
create or replace function public.handle_new_user() 
returns trigger as '
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
' language plpgsql security definer;
```

Then run this block:

```sql
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

## 2. Update `messages` table

Add columns for private messaging:

```sql
alter table public.messages 
  add column if not exists sender_id uuid references auth.users,
  add column if not exists receiver_id uuid references auth.users,
  add column if not exists read boolean default false,
  add column if not exists read_at timestamptz;
```

### Update RLS for private messages

```sql
-- Drop old policies if they exist
drop policy if exists "Users can view their own messages" on public.messages;
drop policy if exists "Users can insert messages" on public.messages;

-- New policies for private chat
create policy "Users can view messages they sent or received"
  on public.messages for select
  to authenticated
  using ( 
    auth.uid() = sender_id or auth.uid() = receiver_id 
  );

create policy "Users can send messages"
  on public.messages for insert
  to authenticated
  with check ( auth.uid() = sender_id );

create policy "Users can mark messages as read"
  on public.messages for update
  to authenticated
  using ( auth.uid() = receiver_id )
  with check ( auth.uid() = receiver_id );
```

## 3. Enable Realtime

### Option A: Via SQL (Recommended)
```sql
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table profiles;
```

### Option B: Via Dashboard
1. Go to Database → Publications
2. Click on `supabase_realtime`
3. Enable `messages` and `profiles` tables

## 4. Enable Broadcast for WebRTC Signaling

Broadcast is enabled by default in Supabase, no configuration needed.

## 5. Populate existing users (if any)

If you already have users in `auth.users`, run this to create their profiles:

```sql
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;
```
