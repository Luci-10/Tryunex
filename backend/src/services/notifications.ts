// In-app notifications.
//
// One row per thing a user should know about, written at the moment the event
// happens rather than derived by polling. `dedupe_key` is what stops a noisy
// event — ten messages in a conversation, a webhook retry — becoming ten
// identical bells.
import { neon } from "@neondatabase/serverless";

function sql() {
  return neon(process.env.DATABASE_URL!);
}

export type NotificationKind =
  | "thrift_message"
  | "thrift_sale_recorded"
  | "thrift_sale_completed"
  | "thrift_listing_sold"
  | "wardrobe_shared"
  | "outfit_suggested"
  | "credits_granted";

let ready: Promise<void> | null = null;

export function ensureNotificationSchema(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    const q = sql();
    await q`CREATE TABLE IF NOT EXISTS "notifications" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "kind" text NOT NULL,
      "title" text NOT NULL,
      "body" text,
      -- Where tapping it should go. Always an in-app path, never a URL.
      "link" text,
      "dedupe_key" text NOT NULL,
      "read_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`;
    await q`CREATE UNIQUE INDEX IF NOT EXISTS "notifications_dedupe_idx"
      ON "notifications" ("dedupe_key")`;
    await q`CREATE INDEX IF NOT EXISTS "notifications_user_idx"
      ON "notifications" ("user_id", "created_at" DESC)`;
    await q`CREATE INDEX IF NOT EXISTS "notifications_unread_idx"
      ON "notifications" ("user_id") WHERE "read_at" IS NULL`;
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

/**
 * Records a notification. Never throws into the caller: a notification is a
 * courtesy, and failing to write one must not fail the sale, message or share
 * that triggered it.
 */
export async function notify(opts: {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  link?: string | null;
  /** Collapses repeats. Same key, same row. */
  dedupeKey: string;
}): Promise<void> {
  try {
    await ensureNotificationSchema();
    const q = sql();
    await q`
      INSERT INTO notifications (user_id, kind, title, body, link, dedupe_key)
      VALUES (${opts.userId}::uuid, ${opts.kind}, ${opts.title},
              ${opts.body ?? null}, ${opts.link ?? null}, ${opts.dedupeKey})
      ON CONFLICT (dedupe_key) DO UPDATE
        SET created_at = now(), read_at = NULL,
            title = EXCLUDED.title, body = EXCLUDED.body`;
  } catch (err: any) {
    console.error(`[notify] could not record ${opts.kind}: ${err?.message ?? err}`);
  }
}

export async function listNotifications(userId: string, limit = 30) {
  await ensureNotificationSchema();
  const q = sql();
  const rows = (await q`
    SELECT id, kind, title, body, link, read_at, created_at
      FROM notifications
     WHERE user_id = ${userId}::uuid
     ORDER BY created_at DESC
     LIMIT ${limit}`) as any[];
  const [count] = (await q`
    SELECT count(*)::int AS unread FROM notifications
     WHERE user_id = ${userId}::uuid AND read_at IS NULL`) as any[];
  return {
    unread: Number(count?.unread ?? 0),
    notifications: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      link: r.link,
      read: Boolean(r.read_at),
      createdAt: r.created_at,
    })),
  };
}

/** Marks one, or everything, as read. Scoped to the caller server-side. */
export async function markRead(userId: string, id?: string): Promise<void> {
  await ensureNotificationSchema();
  const q = sql();
  if (id) {
    await q`UPDATE notifications SET read_at = now()
             WHERE user_id = ${userId}::uuid AND id = ${id}::uuid AND read_at IS NULL`;
  } else {
    await q`UPDATE notifications SET read_at = now()
             WHERE user_id = ${userId}::uuid AND read_at IS NULL`;
  }
}
