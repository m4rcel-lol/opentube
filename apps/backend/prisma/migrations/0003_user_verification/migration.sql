ALTER TABLE "User" ADD COLUMN "isVerified" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User"
SET "isVerified" = true
WHERE "id" IN (
  SELECT "channelOwnerId"
  FROM "Subscription"
  GROUP BY "channelOwnerId"
  HAVING COUNT(*) >= 100000
);
