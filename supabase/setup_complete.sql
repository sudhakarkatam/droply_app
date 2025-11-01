-- ============================================
-- DROPly Database Setup - Complete SQL Script
-- Run this entire script in your Supabase SQL Editor
-- ============================================

-- ============================================
-- STEP 1: Create Tables
-- ============================================

-- Create rooms table   
CREATE TABLE IF NOT EXISTS public.rooms (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  delete_on_view BOOLEAN DEFAULT FALSE,
  view_count INTEGER DEFAULT 0,
  max_views INTEGER DEFAULT NULL,
  password TEXT,
  permissions TEXT DEFAULT 'edit' CHECK (permissions IN ('view', 'edit')),
  creator_token TEXT,
  edit_token TEXT
);

-- Create shares table
CREATE TABLE IF NOT EXISTS public.shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('text', 'file', 'url')),
  content TEXT,
  file_name TEXT,
  file_url TEXT,
  file_size BIGINT,
  file_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- STEP 2: Enable Row Level Security
-- ============================================

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 3: Create Indexes for Performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_rooms_expires_at ON public.rooms(expires_at);
CREATE INDEX IF NOT EXISTS idx_shares_room_id ON public.shares(room_id);

-- ============================================
-- STEP 4: Create Storage Bucket
-- ============================================

-- Create storage bucket for file uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('droply-files', 'droply-files', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- STEP 5: Create Database Functions
-- ============================================

-- Function to cleanup expired rooms
CREATE OR REPLACE FUNCTION public.cleanup_expired_rooms()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rooms
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
END;
$$;

-- Secure function to update room settings (validates creator_token)
CREATE OR REPLACE FUNCTION public.update_room_settings(
  p_room_id TEXT,
  p_creator_token TEXT,
  p_password TEXT DEFAULT NULL,
  p_permissions TEXT DEFAULT NULL,
  p_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_update_password BOOLEAN DEFAULT FALSE,
  p_update_permissions BOOLEAN DEFAULT FALSE,
  p_update_expires_at BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_creator_token TEXT;
  v_updated BOOLEAN := FALSE;
BEGIN
  -- Get current creator_token for the room
  SELECT creator_token INTO v_current_creator_token
  FROM public.rooms
  WHERE id = p_room_id;

  -- Check if room exists
  IF v_current_creator_token IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Room not found'
    );
  END IF;

  -- Validate creator_token matches
  IF v_current_creator_token != p_creator_token THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Unauthorized: Invalid creator token'
    );
  END IF;

  -- Update room settings (only update fields marked for update)
  UPDATE public.rooms
  SET
    password = CASE 
      WHEN p_update_password THEN p_password
      ELSE password
    END,
    permissions = CASE 
      WHEN p_update_permissions THEN p_permissions
      ELSE permissions
    END,
    expires_at = CASE 
      WHEN p_update_expires_at THEN p_expires_at
      ELSE expires_at
    END
  WHERE id = p_room_id
    AND creator_token = p_creator_token;

  -- Check if update was successful using FOUND (automatically set by PostgreSQL)
  IF FOUND THEN
    RETURN json_build_object('success', true);
  ELSE
    RETURN json_build_object(
      'success', false,
      'error', 'Failed to update room settings'
    );
  END IF;
END;
$$;

-- Add comments
COMMENT ON FUNCTION public.cleanup_expired_rooms IS 
'Function to delete expired rooms. Can be scheduled to run periodically.';

COMMENT ON FUNCTION public.update_room_settings IS 
'Secure function to update room settings. Requires valid creator_token. Direct table updates are blocked by RLS policy.';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.cleanup_expired_rooms TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_room_settings TO anon, authenticated;

-- ============================================
-- STEP 6: Create Row Level Security Policies
-- ============================================

-- Drop any existing policies first (to avoid conflicts)
DROP POLICY IF EXISTS "Anyone can view rooms" ON public.rooms;
DROP POLICY IF EXISTS "Anyone can create rooms" ON public.rooms;
DROP POLICY IF EXISTS "Anyone can update rooms" ON public.rooms;
DROP POLICY IF EXISTS "Allow room updates" ON public.rooms;
DROP POLICY IF EXISTS "Anyone can delete their rooms" ON public.rooms;
DROP POLICY IF EXISTS "Allow room deletion" ON public.rooms;
DROP POLICY IF EXISTS "Anyone can view shares" ON public.shares;
DROP POLICY IF EXISTS "Anyone can create shares" ON public.shares;
DROP POLICY IF EXISTS "Anyone can create shares in existing rooms" ON public.shares;
DROP POLICY IF EXISTS "Anyone can delete shares" ON public.shares;
DROP POLICY IF EXISTS "Anyone can update shares" ON public.shares;

-- ROOMS TABLE POLICIES

-- Anyone can view room metadata (needed to check if room exists and get settings)
CREATE POLICY "Anyone can view room metadata"
ON public.rooms
FOR SELECT
USING (true);

-- Anyone can create a room
CREATE POLICY "Anyone can create rooms"
ON public.rooms
FOR INSERT
WITH CHECK (true);

-- Direct updates are blocked - must use update_room_settings() function
CREATE POLICY "Restrict direct room updates"
ON public.rooms
FOR UPDATE
USING (false)  -- Always deny direct updates
WITH CHECK (false);

-- Allow room deletion
CREATE POLICY "Allow room deletion"
ON public.rooms
FOR DELETE
USING (true);

-- SHARES TABLE POLICIES

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

-- Only allow INSERT if room permissions are 'edit'
CREATE POLICY "Allow share creation only in edit rooms"
ON public.shares
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.rooms 
    WHERE rooms.id = shares.room_id
      AND rooms.permissions = 'edit'
  )
);

-- Only allow DELETE if room permissions are 'edit'
CREATE POLICY "Allow share deletion only in edit rooms"
ON public.shares
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.rooms 
    WHERE rooms.id = shares.room_id
      AND rooms.permissions = 'edit'
  )
);

-- Prevent updates to shares (content should be immutable once created)
CREATE POLICY "Prevent share updates"
ON public.shares
FOR UPDATE
USING (false)
WITH CHECK (false);

-- ============================================
-- STEP 7: Create Storage Policies
-- ============================================

-- Drop existing storage policies if any
DROP POLICY IF EXISTS "Anyone can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view files" ON storage.objects;

-- Allow file uploads to droply-files bucket
CREATE POLICY "Anyone can upload files"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'droply-files');

-- Allow file downloads from droply-files bucket
CREATE POLICY "Anyone can view files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'droply-files');

-- ============================================
-- STEP 8: Enable Realtime (Optional)
-- ============================================

-- Enable realtime for shares table (for live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.shares;

-- ============================================
-- SETUP COMPLETE!
-- ============================================
-- 
-- Your database is now configured with:
-- ✓ Rooms and shares tables
-- ✓ Row Level Security policies
-- ✓ Secure room settings update function
-- ✓ Storage bucket for file uploads
-- ✓ Realtime subscriptions enabled
--
-- Next steps:
-- 1. Set your Supabase URL and anon key in your .env file
-- 2. Test creating a room
-- 3. Test sharing content
-- ============================================

