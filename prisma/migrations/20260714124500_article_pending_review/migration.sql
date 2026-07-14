-- Author (tipster) posts require admin review before going live (OB-071).
-- Add a `pending` review state between `draft` and `published`.
ALTER TYPE "ArticleStatus" ADD VALUE 'pending' BEFORE 'published';
