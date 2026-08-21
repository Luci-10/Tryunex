// Permanent account deletion.
//
// This is irreversible by design: when it returns, the user row is gone, every
// cascading row with it, and every stored image that nobody else still needs.
// There is no recovery path, so the route in front of it re-verifies ownership
// of the inbox before calling in.
//
// Three things make this harder than "DELETE FROM users":
//
//  1. Images live in R2, which no foreign key can reach. They have to be
//     collected before the rows vanish and removed afterwards.
//
//  2. An image can be shared. Selling a garment on Thrift hands the buyer a
//     new row pointing at the same object, so deleting the seller must not
//     take the buyer's picture with it. Every object is reference-counted
//     after the rows are gone; a survivor means the object stays.
//
//  3. Payment records are not ours to erase on request. Tax and accounting
//     rules require keeping proof of a transaction, and a chargeback months
//     later has to be answerable. Those rows are archived in pseudonymous
//     form first — amounts, dates and the provider's own identifiers, with
//     no name, email or user id — and the identifiable originals then go.
import { neon } from "@neondatabase/serverless";
import { createHmac } from "node:crypto";
import { deleteObject, keyFromUrl } from "./r2.js";
import { imageReferenceCount } from "./thriftTransfer.js";
import { metric } from "./metrics.js";

function sql() {
  return neon(process.env.DATABASE_URL!);
}

let ready: Promise<void> | null = null;

/** The archive of what survives a deletion, and why. */
export function ensureDeletionSchema(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    const q = sql();
    await q`CREATE TABLE IF NOT EXISTS "retained_financial_records" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      -- Pseudonymous and one-way: groups one person's records together for
      -- reconciliation without being reversible to who they were.
      "account_ref" text NOT NULL,
      "record_kind" text NOT NULL,
      "amount_paise" integer,
      "currency" text,
      "provider" text,
      "provider_order_id" text,
      "provider_payment_id" text,
      "status" text,
      "occurred_at" timestamptz,
      "archived_at" timestamptz NOT NULL DEFAULT now(),
      "reason" text NOT NULL DEFAULT 'account_deleted'
    )`;
    await q`CREATE INDEX IF NOT EXISTS "retained_financial_account_idx"
      ON "retained_financial_records" ("account_ref")`;
    // A deletion that runs twice must not double the archive.
    await q`CREATE UNIQUE INDEX IF NOT EXISTS "retained_financial_unique_idx"
      ON "retained_financial_records" ("account_ref", "record_kind", "provider_payment_id", "occurred_at")
      WHERE "provider_payment_id" IS NOT NULL`;
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

/**
 * Stable pseudonym for a user id. Keyed on JWT_SECRET so the archive cannot be
 * re-linked to an account by anyone who only has a copy of the table.
 */
export function accountRef(userId: string): string {
  const key = process.env.JWT_SECRET;
  if (!key) throw new Error("JWT_SECRET not set");
  return createHmac("sha256", key).update(`account:${userId}`).digest("hex");
}

export type DeletionPreview = {
  clothes: number;
  tryonImages: number;
  activeListings: number;
  conversations: number;
  creditBalance: number;
  payments: number;
};

/** What the user is about to lose, for the confirmation screen. */
export async function previewDeletion(userId: string): Promise<DeletionPreview> {
  const q = sql();
  const [row] = (await q`
    SELECT
      (SELECT count(*) FROM clothes WHERE user_id = ${userId}) AS clothes,
      (SELECT count(*) FROM tryon_assets WHERE user_id = ${userId}) AS tryon_images,
      (SELECT count(*) FROM thrift_listings
        WHERE seller_user_id = ${userId} AND status IN ('draft','active','paused')) AS active_listings,
      (SELECT count(*) FROM thrift_conversations
        WHERE buyer_user_id = ${userId} OR seller_user_id = ${userId}) AS conversations,
      (SELECT COALESCE(SUM(credit_amount), 0) FROM credit_ledger
        WHERE user_id = ${userId}
          AND (expires_at IS NULL OR expires_at > now())) AS credit_balance,
      (SELECT count(*) FROM payments WHERE user_id = ${userId}) AS payments
  `) as any[];
  // count(*) and SUM() both come back as strings from the driver.
  return {
    clothes: Number(row?.clothes ?? 0),
    tryonImages: Number(row?.tryon_images ?? 0),
    activeListings: Number(row?.active_listings ?? 0),
    conversations: Number(row?.conversations ?? 0),
    creditBalance: Number(row?.credit_balance ?? 0),
    payments: Number(row?.payments ?? 0),
  };
}

/** Every image this account is the sole plausible owner of, gathered while the rows still exist. */
async function collectImages(userId: string): Promise<string[]> {
  const q = sql();
  const rows = (await q`
    SELECT image_url FROM clothes WHERE user_id = ${userId} AND image_url <> ''
    UNION
    SELECT image_url FROM tryon_assets WHERE user_id = ${userId} AND image_url <> ''
    UNION
    SELECT image_url FROM thrift_listings WHERE seller_user_id = ${userId} AND image_url <> ''
  `) as Array<{ image_url: string }>;
  return [...new Set(rows.map((r) => r.image_url).filter(Boolean))];
}

/** Copy payment history into the pseudonymous archive before the originals go. */
async function archiveFinancials(userId: string): Promise<number> {
  await ensureDeletionSchema();
  const q = sql();
  const ref = accountRef(userId);
  const rows = (await q`
    INSERT INTO retained_financial_records
      (account_ref, record_kind, amount_paise, currency, provider,
       provider_order_id, provider_payment_id, status, occurred_at)
    SELECT ${ref}, 'payment', p.amount_paise, p.currency, p.provider,
           p.razorpay_order_id, p.razorpay_payment_id, p.status::text, p.created_at
      FROM payments p
     WHERE p.user_id = ${userId}
       -- Only real money. An abandoned checkout is not a record we need.
       AND p.status <> 'created'
    ON CONFLICT DO NOTHING
    RETURNING id
  `) as any[];
  return rows.length;
}

export type DeletionResult = {
  imagesDeleted: number;
  imagesKeptShared: number;
  imagesFailed: number;
  financialRecordsArchived: number;
};

/**
 * Delete the account. Irreversible.
 *
 * Order matters and is deliberate: archive first (so a later failure cannot
 * lose the accounting record), collect image references second (they are
 * unreadable once the rows cascade), delete the user third, and only then
 * touch storage — by which point the reference counts reflect the new truth.
 */
export async function deleteAccount(userId: string): Promise<DeletionResult> {
  const q = sql();

  const financialRecordsArchived = await archiveFinancials(userId);
  const images = await collectImages(userId);

  // One statement, so the whole row graph goes or none of it does. Everything
  // that matters cascades from here.
  await q`DELETE FROM users WHERE id = ${userId}`;

  let imagesDeleted = 0;
  let imagesKeptShared = 0;
  let imagesFailed = 0;

  for (const url of images) {
    try {
      // The rows are gone, so anything still pointing here belongs to someone
      // else — a buyer who now owns the garment, most likely.
      const refs = await imageReferenceCount(url);
      if (refs > 0) {
        imagesKeptShared += 1;
        continue;
      }
      const key = keyFromUrl(url);
      if (!key) {
        // Not an object of ours to remove. Nothing to do, and never log the URL.
        imagesFailed += 1;
        continue;
      }
      await deleteObject(key);
      imagesDeleted += 1;
    } catch (err: any) {
      // The account is already gone; storage cleanup failing must not turn a
      // completed deletion into an error the user sees. Counted and logged so
      // the shortfall is visible.
      imagesFailed += 1;
      console.error(`[account-deletion] image cleanup failed: ${err?.message ?? err}`);
    }
  }

  if (imagesFailed > 0) {
    metric("account_deletion_images_failed", { count: imagesFailed });
  }
  metric("account_deleted", { imagesDeleted, imagesKeptShared, imagesFailed });

  return { imagesDeleted, imagesKeptShared, imagesFailed, financialRecordsArchived };
}
