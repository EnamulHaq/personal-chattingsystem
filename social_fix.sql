-- RUN THIS IN YOUR SUPABASE SQL EDITOR --

-- 1. Ensure profiles table has necessary columns
alter table public.profiles 
add column if not exists full_name text,
add column if not exists avatar_url text;

-- 2. Create/Repair posts table
create table if not exists public.posts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) not null,
  content text,
  image_url text,
  created_at timestamptz default now()
);

-- Ensure user_id points to public.profiles for easier joins
alter table public.posts drop constraint if exists posts_user_id_fkey;
alter table public.posts add constraint posts_user_id_fkey foreign key (user_id) references public.profiles(id);

-- 3. Create/Repair likes table
create table if not exists public.likes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) not null,
  post_id uuid references public.posts on delete cascade not null,
  created_at timestamptz default now(),
  unique(user_id, post_id)
);

alter table public.likes drop constraint if exists likes_user_id_fkey;
alter table public.likes add constraint likes_user_id_fkey foreign key (user_id) references public.profiles(id);

-- 4. Create/Repair comments table
create table if not exists public.comments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) not null,
  post_id uuid references public.posts on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);

alter table public.comments drop constraint if exists comments_user_id_fkey;
alter table public.comments add constraint comments_user_id_fkey foreign key (user_id) references public.profiles(id);


-- 5. Enable RLS
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;

-- 6. RLS Policies for Posts
drop policy if exists "Posts are viewable by everyone" on public.posts;
create policy "Posts are viewable by everyone" on public.posts for select using (true);
drop policy if exists "Users can insert their own posts" on public.posts;
create policy "Users can insert their own posts" on public.posts for insert with check (auth.uid() = user_id);

-- 7. RLS Policies for Likes
drop policy if exists "Likes are viewable by everyone" on public.likes;
create policy "Likes are viewable by everyone" on public.likes for select using (true);
drop policy if exists "Users can toggle their own likes" on public.likes;
create policy "Users can toggle their own likes" on public.likes for insert with check (auth.uid() = user_id);
drop policy if exists "Users can remove their own likes" on public.likes;
create policy "Users can remove their own likes" on public.likes for delete using (auth.uid() = user_id);

-- 8. RLS Policies for Comments
drop policy if exists "Comments are viewable by everyone" on public.comments;
create policy "Comments are viewable by everyone" on public.comments for select using (true);
drop policy if exists "Users can insert their own comments" on public.comments;
create policy "Users can insert their own comments" on public.comments for insert with check (auth.uid() = user_id);

-- 9. Realtime (Idempotent check)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'posts') THEN
    alter publication supabase_realtime add table posts;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'likes') THEN
    alter publication supabase_realtime add table likes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'comments') THEN
    alter publication supabase_realtime add table comments;
  END IF;
END $$;

