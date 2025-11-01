-- Add edit_token column to rooms table for editable link system
-- This migration adds edit_token to existing rooms by generating random UUIDs

-- Add edit_token column if it doesn't exist
ALTER TABLE public.rooms 
ADD COLUMN IF NOT EXISTS edit_token TEXT;

-- Generate edit_token for existing rooms that don't have one
UPDATE public.rooms
SET edit_token = gen_random_uuid()::text
WHERE edit_token IS NULL;

