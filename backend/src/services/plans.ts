// Shared helper: flip any of `userId`'s clothes from clean → worn when their
// scheduled wear_event date has passed without being processed. Idempotent
// thanks to wear_events.settled. Called from /clothes reads and from
// /friends/:ownerId/* reads so a visitor's view of their friend is also
// current (the owner doesn't have to log in for their plans to settle).
import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "../db/client.js";
import { clothes, wearEvents } from "../db/schema.js";

export async function settlePastPlans(userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const past = await db
    .select({ clothId: wearEvents.clothId })
    .from(wearEvents)
    .where(
      and(
        eq(wearEvents.userId, userId),
        lt(wearEvents.wornOn, today),
        eq(wearEvents.settled, false),
      ),
    );
  if (past.length === 0) return;
  const clothIds = Array.from(new Set(past.map((p) => p.clothId)));
  await db
    .update(clothes)
    .set({ status: "worn" })
    .where(and(eq(clothes.userId, userId), inArray(clothes.id, clothIds)));
  await db
    .update(wearEvents)
    .set({ settled: true })
    .where(
      and(
        eq(wearEvents.userId, userId),
        lt(wearEvents.wornOn, today),
        eq(wearEvents.settled, false),
      ),
    );
}
