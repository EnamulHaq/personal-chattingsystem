-- Add type and file_url columns to messages
alter table public.messages add column if not exists type text default 'text';
alter table public.messages add column if not exists file_url text;

-- Ensure RLS is updated for the new columns (should be fine as we use ALL or specific policies)
