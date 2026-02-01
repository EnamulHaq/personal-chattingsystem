-- Run this SQL in your Supabase SQL Editor to add read/unread functionality

-- 1. Add read columns to messages table
ALTER TABLE public.messages 
  ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- 2. Update existing messages to be unread
UPDATE public.messages SET read = false WHERE read IS NULL;

-- 3. Add RLS policy for marking messages as read
DROP POLICY IF EXISTS "Users can mark messages as read" ON public.messages;

CREATE POLICY "Users can mark messages as read"
  ON public.messages FOR UPDATE
  TO authenticated
  USING ( auth.uid() = receiver_id )
  WITH CHECK ( auth.uid() = receiver_id );

-- 4. Verify the changes
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'messages' 
  AND column_name IN ('read', 'read_at')
ORDER BY column_name;
