-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "UserAuditAction" AS ENUM (
    'USER_CREATED',
    'USER_UPDATED',
    'PASSWORD_RESET',
    'ROLE_CHANGED',
    'USER_ENABLED',
    'USER_DISABLED'
);

-- Fail closed if the existing data cannot be mapped without guessing.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "users"
        WHERE "role" IS NULL
           OR LOWER("role") NOT IN ('admin', 'user')
    ) THEN
        RAISE EXCEPTION 'Existing users contain a role outside the approved admin/user mapping';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "users"
        WHERE LOWER(SPLIT_PART("email", '@', 1)) = ''
    ) THEN
        RAISE EXCEPTION 'Existing users contain an empty username backfill candidate';
    END IF;

    IF EXISTS (
        SELECT LOWER(SPLIT_PART("email", '@', 1))
        FROM "users"
        GROUP BY LOWER(SPLIT_PART("email", '@', 1))
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Existing users contain colliding username backfill candidates';
    END IF;
END $$;

-- Add the new account fields before enforcing their final constraints.
ALTER TABLE "users"
    ADD COLUMN "username" TEXT,
    ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- Deterministic, documented backfill: lowercase email local-part.
UPDATE "users"
SET "username" = LOWER(SPLIT_PART("email", '@', 1))
WHERE "username" IS NULL;

ALTER TABLE "users"
    ALTER COLUMN "username" SET NOT NULL;

-- Preserve existing role meaning while moving to the target vocabulary.
ALTER TABLE "users"
    ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "users"
    ALTER COLUMN "role" TYPE "UserRole"
    USING CASE LOWER("role")
        WHEN 'admin' THEN 'ADMIN'::"UserRole"
        WHEN 'user' THEN 'USER'::"UserRole"
    END;

ALTER TABLE "users"
    ALTER COLUMN "role" SET DEFAULT 'ADMIN';

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateTable
CREATE TABLE "user_audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_user_id" BIGINT NOT NULL,
    "target_user_id" BIGINT NOT NULL,
    "action" "UserAuditAction" NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_audit_logs_actor_user_id_idx" ON "user_audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "user_audit_logs_target_user_id_idx" ON "user_audit_logs"("target_user_id");

-- CreateIndex
CREATE INDEX "user_audit_logs_created_at_idx" ON "user_audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "user_audit_logs"
    ADD CONSTRAINT "user_audit_logs_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_audit_logs"
    ADD CONSTRAINT "user_audit_logs_target_user_id_fkey"
    FOREIGN KEY ("target_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
