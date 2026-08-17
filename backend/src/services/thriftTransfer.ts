// Thrift sale completion and the wardrobe transfer it triggers.
//
// Context worth knowing: TryUnex takes no marketplace payment. There is no
// gateway to verify against, so "completed" cannot mean "payment cleared".
// Instead a sale needs BOTH parties: the seller marks it sold against a named
// buyer, and the buyer confirms they received it. Two independent accounts
// acting is materially stronger than one button, and when real payments arrive
// a webhook can drive the same `completed` transition with no other change.
import { neon } from "@neondatabase/serverless";

function sql() {
  return neon(process.env.DATABASE_URL!);
}

export type TxStatus = "pending" | "completed" | "cancelled" | "refunded";

let ready: Promise<void> | null = null;

export function ensureTransferSchema(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    const q = sql();
    await q`DO $$ BEGIN
      CREATE TYPE "thrift_tx_status" AS ENUM('pending','completed','cancelled','refunded');
    EXCEPTION WHEN duplicate_object THEN null; END $$`;

    await q`CREATE TABLE IF NOT EXISTS "thrift_transactions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "listing_id" uuid NOT NULL REFERENCES "thrift_listings"("id") ON DELETE CASCADE,
      "seller_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "buyer_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      -- Deliberately NOT a foreign key. The transfer deletes the seller's
      -- garment, and a cascade here would take the transaction and its audit
      -- trail with it — destroying the record of the sale that caused it.
      "source_cloth_id" uuid NOT NULL,
      "status" "thrift_tx_status" NOT NULL DEFAULT 'pending',
      "seller_confirmed_at" timestamptz,
      "buyer_confirmed_at" timestamptz,
      -- Reserved for a future payment provider reference. Unused today.
      "payment_ref" text,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "completed_at" timestamptz,
      -- Set in the same statement as the move. This column, not the audit
      -- table, is what makes a repeated transfer a no-op.
      "transferred_cloth_id" uuid,
      "transferred_at" timestamptz
    )`;
    // Drop the cascade if an earlier deploy created it.
    await q`ALTER TABLE "thrift_transactions"
      DROP CONSTRAINT IF EXISTS "thrift_transactions_source_cloth_id_fkey"`;
    await q`ALTER TABLE "thrift_transactions" ADD COLUMN IF NOT EXISTS "transferred_cloth_id" uuid`;
    await q`ALTER TABLE "thrift_transactions" ADD COLUMN IF NOT EXISTS "transferred_at" timestamptz`;
    // One open sale per listing: a second buyer cannot start one while a sale
    // is pending or done.
    await q`CREATE UNIQUE INDEX IF NOT EXISTS "thrift_tx_one_open_idx"
      ON "thrift_transactions" ("listing_id")
      WHERE "status" IN ('pending','completed')`;
    await q`CREATE INDEX IF NOT EXISTS "thrift_tx_buyer_idx" ON "thrift_transactions" ("buyer_user_id")`;
    await q`CREATE INDEX IF NOT EXISTS "thrift_tx_seller_idx" ON "thrift_transactions" ("seller_user_id")`;

    // Audit trail. One row per transaction is the idempotency guard for the
    // transfer itself.
    await q`CREATE TABLE IF NOT EXISTS "thrift_transfers" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "transaction_id" uuid NOT NULL REFERENCES "thrift_transactions"("id") ON DELETE CASCADE,
      "listing_id" uuid NOT NULL,
      "seller_user_id" uuid NOT NULL,
      "buyer_user_id" uuid NOT NULL,
      "source_cloth_id" uuid NOT NULL,
      "new_cloth_id" uuid NOT NULL,
      "image_url" text NOT NULL,
      "transferred_at" timestamptz NOT NULL DEFAULT now()
    )`;
    await q`CREATE UNIQUE INDEX IF NOT EXISTS "thrift_transfers_tx_idx"
      ON "thrift_transfers" ("transaction_id")`;
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

export type TransferResult =
  | { ok: true; newClothId: string; alreadyDone: boolean }
  | { ok: false; reason: string };

/**
 * Moves the garment from seller to buyer, once.
 *
 * Neon's HTTP driver has no interactive transactions, so the whole thing is a
 * single statement. The CTEs run in one snapshot, which is what makes it
 * atomic: the buyer's row cannot be created without the seller's being
 * removed, and neither happens twice.
 *
 * The guards, in order:
 *  - an advisory lock serialises concurrent callbacks for this transaction;
 *  - `existing` short-circuits a repeat, so a duplicated webhook is a no-op;
 *  - `src` re-checks the seller still owns the garment at transfer time;
 *  - the unique index on thrift_transfers.transaction_id is the backstop.
 *
 * The image is NOT copied. The buyer's row points at the same R2 object, which
 * is why deletion has to count references before removing anything.
 */
export async function transferGarment(transactionId: string): Promise<TransferResult> {
  await ensureTransferSchema();
  const q = sql();

  // One statement does the move. The earlier version also wrote the audit row
  // inside this CTE, reading `FROM tx, ins` — one data-modifying CTE selecting
  // from another. Its RETURNING flowed out but the insert never persisted, so
  // the audit table stayed empty. Idempotency now rests on
  // thrift_transactions.transferred_cloth_id, set in the same snapshot as the
  // move, and the audit row is written separately below.
  const rows = (await q`
    WITH lk AS (
      SELECT pg_advisory_xact_lock(hashtextextended(${transactionId}, 99)) AS locked
    ),
    tx AS (
      SELECT t.* FROM thrift_transactions t, lk
       WHERE t.id = ${transactionId}::uuid
         AND t.status = 'completed'
         AND t.buyer_user_id <> t.seller_user_id
    ),
    src AS (
      SELECT c.* FROM clothes c JOIN tx ON c.id = tx.source_cloth_id
       WHERE c.user_id = tx.seller_user_id
    ),
    ins AS (
      INSERT INTO clothes (user_id, name, category, image_url, style_tag, status)
      SELECT tx.buyer_user_id, src.name, src.category, src.image_url, src.style_tag, 'clean'
        FROM src, tx
       WHERE tx.transferred_cloth_id IS NULL
      RETURNING id, image_url
    ),
    upd AS (
      UPDATE thrift_transactions
         SET transferred_cloth_id = (SELECT id FROM ins),
             transferred_at = now(), updated_at = now()
       WHERE id = ${transactionId}::uuid
         AND transferred_cloth_id IS NULL
         AND EXISTS (SELECT 1 FROM ins)
      RETURNING transferred_cloth_id
    ),
    del AS (
      DELETE FROM clothes
       WHERE id IN (SELECT source_cloth_id FROM tx)
         AND EXISTS (SELECT 1 FROM upd)
      RETURNING id
    )
    SELECT (SELECT transferred_cloth_id FROM upd)  AS inserted,
           (SELECT transferred_cloth_id FROM tx)   AS already,
           (SELECT id FROM tx)                     AS tx_id,
           (SELECT id FROM src)                    AS src_id,
           (SELECT count(*) FROM del)::int         AS removed`) as any[];

  const row = rows[0] ?? {};
  if (row.already) return { ok: true, newClothId: row.already, alreadyDone: true };
  if (!row.tx_id) return { ok: false, reason: "No completed transaction for this id" };
  if (!row.src_id) return { ok: false, reason: "The seller no longer owns that piece" };
  if (!row.inserted) return { ok: false, reason: "Transfer did not complete" };

  // Audit, written after the move. A failure here leaves the transfer correct
  // and still idempotent — only the audit row is missing, and it can be
  // backfilled from the transaction.
  try {
    await q`
      INSERT INTO thrift_transfers
        (transaction_id, listing_id, seller_user_id, buyer_user_id,
         source_cloth_id, new_cloth_id, image_url)
      SELECT t.id, t.listing_id, t.seller_user_id, t.buyer_user_id,
             t.source_cloth_id, t.transferred_cloth_id, c.image_url
        FROM thrift_transactions t
        JOIN clothes c ON c.id = t.transferred_cloth_id
       WHERE t.id = ${transactionId}::uuid
      ON CONFLICT (transaction_id) DO NOTHING`;
  } catch (err: any) {
    console.error(`[thrift] transfer audit failed for ${transactionId}: ${err?.message ?? err}`);
  }

  return { ok: true, newClothId: row.inserted, alreadyDone: false };
}

/**
 * How many live records still point at an image.
 *
 * Called before deleting from R2. A thrift transfer deliberately leaves two
 * wardrobe rows sharing one object for a moment, and listings and try-on
 * history reference images too — deleting on the first row going away would
 * break all of them.
 */
export async function imageReferenceCount(imageUrl: string, excludeClothId?: string): Promise<number> {
  await ensureTransferSchema();
  const q = sql();
  const rows = (await q`
    SELECT
      (SELECT count(*) FROM clothes
        WHERE image_url = ${imageUrl}
          AND (${excludeClothId ?? null}::uuid IS NULL OR id <> ${excludeClothId ?? null}::uuid))
      +
      (SELECT count(*) FROM thrift_listings WHERE image_url = ${imageUrl})
      +
      (SELECT count(*) FROM tryon_assets WHERE image_url = ${imageUrl})
      +
      (SELECT count(*) FROM thrift_transfers WHERE image_url = ${imageUrl})
      AS refs`) as any[];
  return Number(rows[0]?.refs ?? 0);
}
