-- 1. Create Friends table
create table if not exists public.friends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  friend_id uuid references auth.users not null,
  status text check (status in ('pending', 'accepted')) default 'pending',
  created_at timestamptz default now(),
  unique(user_id, friend_id)
);

-- 2. Enable RLS
alter table public.friends enable row level security;

-- 3. Policies for Friends table
create policy "Users can view their own friend relationships"
  on public.friends for select
  to authenticated
  using ( auth.uid() = user_id or auth.uid() = friend_id );

create policy "Users can send friend requests"
  on public.friends for insert
  to authenticated
  with check ( auth.uid() = user_id );

create policy "Users can accept friend requests"
  on public.friends for update
  to authenticated
  using ( auth.uid() = friend_id )
  with check ( auth.uid() = friend_id );

-- 4. Enable Realtime for friends table
alter publication supabase_realtime add table public.friends;
