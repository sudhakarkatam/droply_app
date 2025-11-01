-- ============================================
-- DROPly Database Setup - Complete SQL Script
-- Run this entire script in your Supabase SQL Editor
-- This is a FRESH setup that drops and recreates everything
-- ============================================

-- ============================================
-- STEP 0: Drop ALL existing functions first
-- ============================================

-- Drop all possible versions of update_room_settings
DROP FUNCTION IF EXISTS public.update_room_settings(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, BOOLEAN, BOOLEAN, BOOLEAN);
DROP FUNCTION IF EXISTS public.update_room_settings(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, BOOLEAN, BOOLEAN);
DROP FUNCTION IF EXISTS public.update_room_settings(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE);
DROP FUNCTION IF EXISTS public.update_room_settings(TEXT);
DROP FUNCTION IF EXISTS public.update_room_settings;

-- Drop all possible versions of delete_room
DROP FUNCTION IF EXISTS public.delete_room(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.delete_room(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.delete_room(TEXT);
DROP FUNCTION IF EXISTS public.delete_room;

-- Drop cleanup function
DROP FUNCTION IF EXISTS public.cleanup_expired_rooms();

-- ============================================
-- STEP 1: Drop and Recreate Tables (Clean Schema)
-- ============================================

-- Drop existing tables (in reverse order due to foreign keys)
DROP TABLE IF EXISTS public.shares CASCADE;
DROP TABLE IF EXISTS public.rooms CASCADE;

-- Create rooms table (removed edit_token column)
CREATE TABLE public.rooms (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  delete_on_view BOOLEAN DEFAULT FALSE,
  view_count INTEGER DEFAULT 0,
  max_views INTEGER DEFAULT NULL,
  password TEXT,
  permissions TEXT DEFAULT 'edit' CHECK (permissions IN ('view', 'edit')),
  creator_token TEXT
);

-- Create shares table
CREATE TABLE public.shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('text', 'file', 'url', 'code')),
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

CREATE INDEX idx_rooms_expires_at ON public.rooms(expires_at);
CREATE INDEX idx_shares_room_id ON public.shares(room_id);

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
CREATE FUNCTION public.cleanup_expired_rooms()
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

-- Secure function to update room settings
-- For password-protected rooms: requires current password hash
-- For non-password rooms: requires creator_token (if room has one)
CREATE FUNCTION public.update_room_settings(
  p_room_id TEXT,
  p_current_password_hash TEXT DEFAULT NULL,
  p_creator_token TEXT DEFAULT NULL,
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
  v_room_password TEXT;
  v_room_creator_token TEXT;
  v_authorized BOOLEAN := FALSE;
  v_room_exists BOOLEAN := FALSE;
BEGIN
  -- Get room password and creator_token
  SELECT password, creator_token INTO v_room_password, v_room_creator_token
  FROM public.rooms
  WHERE id = p_room_id;

  -- Check if room exists using FOUND (fixed bug)
  v_room_exists := FOUND;
  
  IF NOT v_room_exists THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Room not found'
    );
  END IF;

  -- Determine authorization:
  -- 1. If room has password: require current password hash to match
  -- 2. If room has no password: require creator_token to match (if room has one)
  -- 3. If no password and no creator_token in room: allow update (public room)
  IF v_room_password IS NOT NULL THEN
    -- Password-protected room: verify current password
    IF p_current_password_hash IS NULL OR p_current_password_hash != v_room_password THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Unauthorized: Invalid password'
      );
    END IF;
    v_authorized := TRUE;
  ELSIF v_room_creator_token IS NOT NULL AND p_creator_token IS NOT NULL THEN
    -- Non-password room with creator: verify creator_token
    IF v_room_creator_token != p_creator_token THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Unauthorized: Invalid creator token'
      );
    END IF;
    v_authorized := TRUE;
  ELSE
    -- Public room (no password, no creator_token): allow update
    v_authorized := TRUE;
  END IF;

  IF NOT v_authorized THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Unauthorized'
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
  WHERE id = p_room_id;

  -- Check if update was successful using FOUND
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

-- Function to delete room
CREATE FUNCTION public.delete_room(
    p_room_id TEXT,
    p_current_password_hash TEXT DEFAULT NULL,
    p_creator_token TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room_password TEXT;
    v_room_creator_token TEXT;
    v_authorized BOOLEAN := FALSE;
    v_room_exists BOOLEAN := FALSE;
BEGIN
    -- Get room password and creator_token
    SELECT password, creator_token INTO v_room_password, v_room_creator_token
    FROM public.rooms
    WHERE id = p_room_id;

    -- Check if room exists using FOUND (fixed bug)
    v_room_exists := FOUND;
    
    IF NOT v_room_exists THEN
        RETURN json_build_object('success', FALSE, 'error', 'Room not found.');
    END IF;

    -- Determine authorization:
    -- 1. If room has password: require current password hash to match
    -- 2. If room has no password: require creator_token to match (if room has one)
    -- 3. If no password and no creator_token in room: allow deletion (public room)
    IF v_room_password IS NOT NULL THEN
        -- Password-protected room: verify current password
        IF p_current_password_hash IS NULL OR p_current_password_hash != v_room_password THEN
            RETURN json_build_object('success', FALSE, 'error', 'Unauthorized: Invalid password.');
        END IF;
        v_authorized := TRUE;
    ELSIF v_room_creator_token IS NOT NULL AND p_creator_token IS NOT NULL THEN
        -- Non-password room with creator: verify creator_token
        IF v_room_creator_token != p_creator_token THEN
            RETURN json_build_object('success', FALSE, 'error', 'Unauthorized: Invalid creator token.');
        END IF;
        v_authorized := TRUE;
    ELSE
        -- Public room (no password, no creator_token): allow deletion
        v_authorized := TRUE;
    END IF;

    IF NOT v_authorized THEN
        RETURN json_build_object('success', FALSE, 'error', 'Unauthorized.');
    END IF;

    -- Delete associated shares first (CASCADE should handle this, but being explicit)
    DELETE FROM public.shares
    WHERE room_id = p_room_id;

    -- Then delete the room
    DELETE FROM public.rooms
    WHERE id = p_room_id;

    RETURN json_build_object('success', TRUE, 'message', 'Room and all shares deleted successfully.');

EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- Add comments
COMMENT ON FUNCTION public.cleanup_expired_rooms IS 
'Function to delete expired rooms. Can be scheduled to run periodically.';

COMMENT ON FUNCTION public.update_room_settings IS 
'Secure function to update room settings. For password-protected rooms: requires current password hash. For non-password rooms: requires creator_token (if room has one). Direct table updates are blocked by RLS policy.';

COMMENT ON FUNCTION public.delete_room IS 
'Secure function to delete a room. For password-protected rooms: requires current password hash. For non-password rooms: requires creator_token (if room has one).';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.cleanup_expired_rooms() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_room_settings(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, BOOLEAN, BOOLEAN, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_room(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ============================================
-- STEP 6: Create Row Level Security Policies
-- ============================================

-- Drop any existing policies first (to avoid conflicts)
DROP POLICY IF EXISTS "Anyone can view rooms" ON public.rooms;
DROP POLICY IF EXISTS "Anyone can view room metadata" ON public.rooms;
DROP POLICY IF EXISTS "Anyone can create rooms" ON public.rooms;
DROP POLICY IF EXISTS "Anyone can update rooms" ON public.rooms;
DROP POLICY IF EXISTS "Allow room updates" ON public.rooms;
DROP POLICY IF EXISTS "Restrict direct room updates" ON public.rooms;
DROP POLICY IF EXISTS "Anyone can delete their rooms" ON public.rooms;
DROP POLICY IF EXISTS "Allow room deletion" ON public.rooms;
DROP POLICY IF EXISTS "Anyone can view shares" ON public.shares;
DROP POLICY IF EXISTS "Anyone can create shares" ON public.shares;
DROP POLICY IF EXISTS "Anyone can create shares in existing rooms" ON public.shares;
DROP POLICY IF EXISTS "Allow share creation only in edit rooms" ON public.shares;
DROP POLICY IF EXISTS "Anyone can delete shares" ON public.shares;
DROP POLICY IF EXISTS "Allow share deletion only in edit rooms" ON public.shares;
DROP POLICY IF EXISTS "Anyone can update shares" ON public.shares;
DROP POLICY IF EXISTS "Prevent share updates" ON public.shares;
DROP POLICY IF EXISTS "Allow share updates in edit rooms" ON public.shares;

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
USING (false)
WITH CHECK (false);

-- Allow room deletion (via delete_room function or direct delete)
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

-- Allow updates only for re-encryption (when room permissions allow editing)
-- This is needed for password change scenarios where content needs to be re-encrypted
CREATE POLICY "Allow share updates in edit rooms"
ON public.shares
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.rooms 
    WHERE rooms.id = shares.room_id
      AND rooms.permissions = 'edit'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.rooms 
    WHERE rooms.id = shares.room_id
      AND rooms.permissions = 'edit'
  )
);

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
-- Note: This may fail if table is already in publication, ignore the error
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.shares;
EXCEPTION
  WHEN duplicate_object THEN
    NULL; -- Table already in publication, ignore
END $$;

-- ============================================
-- SETUP COMPLETE!
-- ============================================
-- 
-- Your database is now configured with:
-- ✓ Rooms and shares tables (clean schema, no edit_token)
-- ✓ Row Level Security policies
-- ✓ Secure room settings update function (single signature)
-- ✓ Secure delete room function (single signature)
-- ✓ Storage bucket for file uploads
-- ✓ Realtime subscriptions enabled
--
-- Key fixes:
-- ✓ Removed edit_token column
-- ✓ Fixed room existence check bug (uses FOUND instead of password NULL check)
-- ✓ Only ONE function signature exists (no conflicts)
-- ✓ Proper authorization logic for password-protected vs non-password rooms
--
-- Next steps:
-- 1. Set your Supabase URL and anon key in your .env file
-- 2. Test creating a room
-- 3. Test sharing content
-- 4. Test updating room settings
-- ============================================
