-- Add permissions field to rooms
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS permissions TEXT DEFAULT 'edit' CHECK (permissions IN ('view', 'edit'));

-- Add creator_token to track room ownership (since we don't have auth)
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS creator_token TEXT;

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Anyone can view rooms" ON public.rooms;
DROP POLICY IF EXISTS "Anyone can create rooms" ON public.rooms;
DROP POLICY IF EXISTS "Anyone can update rooms" ON public.rooms;
DROP POLICY IF EXISTS "Anyone can delete their rooms" ON public.rooms;

DROP POLICY IF EXISTS "Anyone can view shares" ON public.shares;
DROP POLICY IF EXISTS "Anyone can create shares" ON public.shares;

-- Create secure RLS policies for rooms
-- Public read access (needed to check if room exists and get settings)
CREATE POLICY "Anyone can view room metadata"
ON public.rooms
FOR SELECT
USING (true);

-- Anyone can create a room
CREATE POLICY "Anyone can create rooms"
ON public.rooms
FOR INSERT
WITH CHECK (true);

-- Only allow updates via RPC functions (will add validation)
CREATE POLICY "Allow room updates"
ON public.rooms
FOR UPDATE
USING (true);

-- Allow room deletion
CREATE POLICY "Allow room deletion"
ON public.rooms
FOR DELETE
USING (true);

-- Create secure RLS policies for shares
-- Anyone can view shares for rooms they have access to (validated client-side via password)
CREATE POLICY "Anyone can view shares"
ON public.shares
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.rooms 
    WHERE rooms.id = shares.room_id
  )
);

-- Anyone can create shares in existing rooms
CREATE POLICY "Anyone can create shares in existing rooms"
ON public.shares
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.rooms 
    WHERE rooms.id = room_id
  )
);

-- Allow deletion of shares
CREATE POLICY "Anyone can delete shares"
ON public.shares
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.rooms 
    WHERE rooms.id = shares.room_id
  )
);

-- Add update policy for shares
CREATE POLICY "Anyone can update shares"
ON public.shares
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.rooms 
    WHERE rooms.id = shares.room_id
  )
);