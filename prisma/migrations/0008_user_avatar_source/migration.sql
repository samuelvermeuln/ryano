-- Migration 0008_user_avatar_source
--
-- Additive migration: adds AvatarSource enum and User.avatarSource column.
--
-- Context: avatars are moving from files on disk (public/uploads/avatars/**)
-- to base64 data URIs stored directly in User.image. The path-based prefix
-- (/uploads/avatars/custom/... vs /uploads/avatars/google/...) previously
-- distinguished a user-uploaded avatar from a Google-synced one; that signal
-- moves to this explicit column so a Google login can never silently overwrite
-- a custom avatar once User.image no longer encodes provenance in its shape.
--
-- No backfill: existing User.image values (old /uploads/avatars/... paths)
-- are left as-is and avatarSource stays NULL for them. Old physical files
-- under public/uploads/avatars are not deleted by this migration.

-- CreateEnum
CREATE TYPE "AvatarSource" AS ENUM ('CUSTOM', 'GOOGLE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "avatarSource" "AvatarSource";
