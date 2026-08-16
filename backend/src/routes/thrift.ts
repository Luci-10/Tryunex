import { Router } from "express";
import { z } from "zod";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../db/client.js";
import {
  clothes,
  users,
  thriftListings,
  thriftSaves,
  thriftConversations,
  thriftMessages,
  thriftListingReports,
  thriftConversationReports,
  thriftBlocks,
  STYLE_TAGS,
  THRIFT_CONDITIONS,
  THRIFT_DELIVERY,
  LISTING_REPORT_REASONS,
  CONVERSATION_REPORT_REASONS,
} from "../db/schema.js";
import type { ThriftConversation, ThriftListing } from "../db/schema.js";
import { requireAuth } from "../services/auth.js";
import { ensureThriftSchema, CLOSED_MESSAGE } from "../services/thrift.js";

const router = Router();
router.use(requireAuth);
router.use(async (_req, _res, next) => {
  await ensureThriftSchema();
  next();
});

const CATEGORIES = ["top", "bottom", "dress", "outerwear", "shoes", "accessory", "other"] as const;

/* ------------------------------------------------------------- helpers */

/**
 * Everyone this user must not see, in either direction. A block is stored
 * one-way but enforced both ways, so neither party can reach the other and
 * neither learns which of them did the blocking.
 */
async function hiddenUserIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ a: thriftBlocks.blockerUserId, b: thriftBlocks.blockedUserId })
    .from(thriftBlocks)
    .where(or(eq(thriftBlocks.blockerUserId, userId), eq(thriftBlocks.blockedUserId, userId)));
  const out = new Set<string>();
  for (const r of rows) out.add(r.a === userId ? r.b : r.a);
  return [...out];
}

/**
 * The public shape of a listing. Deliberately built by hand rather than
 * spreading the row: seller email, and anything else private, can then never
 * leak by someone adding a column later.
 */
function publicListing(row: any, sellerName: string | null, saved = false) {
  return {
    id: row.id,
    title: row.title,
    pricePaise: row.pricePaise,
    currency: row.currency,
    size: row.size,
    condition: row.condition,
    brand: row.brand,
    description: row.description,
    deliveryPreference: row.deliveryPreference,
    city: row.city,
    status: row.status,
    imageUrl: row.imageUrl,
    category: row.category,
    styleTag: row.styleTag,
    createdAt: row.createdAt,
    soldAt: row.soldAt,
    sellerUserId: row.sellerUserId,
    sellerName: sellerName ?? "TryUnex member",
    sourceClothId: row.sourceClothId,
    saved,
  };
}

/** Phone numbers and email addresses stay out of marketplace messages. */
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]{2,}/;
const PHONE_RE = /(?:\+?\d[\s-]?){8,}/;

function containsContactInfo(text: string): boolean {
  return EMAIL_RE.test(text) || PHONE_RE.test(text);
}

/** Strips control characters; React handles HTML escaping at render time. */
function cleanText(s: string): string {
  // Strip C0/C1 control characters but keep tab, newline and carriage return,
  // which are legitimate in a multi-line description.
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "").trim();
}

async function loadListing(id: string) {
  const [row] = await db.select().from(thriftListings).where(eq(thriftListings.id, id)).limit(1);
  return row ?? null;
}

/* ------------------------------------------------------------ browsing */

// GET /thrift/listings — the buyer marketplace. Only `active` listings, never
// the caller's own unless they ask for them explicitly.
router.get("/listings", async (req, res) => {
  const parse = z
    .object({
      q: z.string().max(80).optional(),
      category: z.enum(CATEGORIES).optional(),
      styleTag: z.enum(STYLE_TAGS).optional(),
      condition: z.enum(THRIFT_CONDITIONS).optional(),
      size: z.string().max(24).optional(),
      delivery: z.enum(THRIFT_DELIVERY).optional(),
      city: z.string().max(60).optional(),
      minPaise: z.coerce.number().int().min(0).optional(),
      maxPaise: z.coerce.number().int().min(0).optional(),
      sort: z.enum(["newest", "price_asc", "price_desc"]).default("newest"),
      mine: z.enum(["true", "false"]).default("false"),
      limit: z.coerce.number().int().min(1).max(48).default(24),
      offset: z.coerce.number().int().min(0).default(0),
    })
    .safeParse(req.query ?? {});
  if (!parse.success) return res.status(400).json({ error: "Invalid filters" });
  const f = parse.data;
  const me = req.userId!;

  const where = [eq(thriftListings.status, "active" as const)];

  if (f.mine === "true") where.push(eq(thriftListings.sellerUserId, me));
  else {
    where.push(ne(thriftListings.sellerUserId, me));
    const hidden = await hiddenUserIds(me);
    if (hidden.length > 0) where.push(notInArray(thriftListings.sellerUserId, hidden));
  }

  if (f.category) where.push(eq(thriftListings.category, f.category));
  if (f.styleTag) where.push(eq(thriftListings.styleTag, f.styleTag));
  if (f.condition) where.push(eq(thriftListings.condition, f.condition));
  if (f.size) where.push(sql`lower(${thriftListings.size}) = lower(${f.size})`);
  if (f.city) where.push(sql`lower(${thriftListings.city}) = lower(${f.city})`);
  if (f.delivery) {
    // "Either" satisfies a buyer looking for pickup or for shipping.
    where.push(
      f.delivery === "either"
        ? eq(thriftListings.deliveryPreference, "either" as const)
        : or(
            eq(thriftListings.deliveryPreference, f.delivery),
            eq(thriftListings.deliveryPreference, "either" as const),
          )!,
    );
  }
  if (f.minPaise !== undefined) where.push(gte(thriftListings.pricePaise, f.minPaise));
  if (f.maxPaise !== undefined) where.push(lte(thriftListings.pricePaise, f.maxPaise));
  if (f.q) {
    const like = `%${f.q.toLowerCase()}%`;
    where.push(
      sql`(lower(${thriftListings.title}) LIKE ${like}
        OR lower(coalesce(${thriftListings.brand}, '')) LIKE ${like}
        OR lower(${thriftListings.category}) LIKE ${like}
        OR lower(coalesce(${thriftListings.styleTag}::text, '')) LIKE ${like})`,
    );
  }

  const order =
    f.sort === "price_asc"
      ? asc(thriftListings.pricePaise)
      : f.sort === "price_desc"
        ? desc(thriftListings.pricePaise)
        : desc(thriftListings.createdAt);

  const rows = await db
    .select({ listing: thriftListings, sellerName: users.name })
    .from(thriftListings)
    .innerJoin(users, eq(users.id, thriftListings.sellerUserId))
    .where(and(...where))
    .orderBy(order)
    .limit(f.limit + 1)
    .offset(f.offset);

  const page = rows.slice(0, f.limit);
  const ids = page.map((r) => r.listing.id);
  const savedIds = new Set<string>();
  if (ids.length > 0) {
    const saves = await db
      .select({ listingId: thriftSaves.listingId })
      .from(thriftSaves)
      .where(and(eq(thriftSaves.userId, me), inArray(thriftSaves.listingId, ids)));
    for (const s of saves) savedIds.add(s.listingId);
  }

  res.json({
    listings: page.map((r) => publicListing(r.listing, r.sellerName, savedIds.has(r.listing.id))),
    hasMore: rows.length > f.limit,
  });
});

// GET /thrift/listings/:id — full detail. A non-active listing is still
// readable (buyers hold links, and conversations reference it) but the client
// is told plainly that it is unavailable.
router.get("/listings/:id", async (req, res) => {
  const me = req.userId!;
  const row = await loadListing(req.params.id);
  if (!row) return res.status(404).json({ error: "Listing not found" });

  if (row.sellerUserId !== me) {
    const hidden = await hiddenUserIds(me);
    if (hidden.includes(row.sellerUserId)) return res.status(404).json({ error: "Listing not found" });
  }

  const [seller] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, row.sellerUserId))
    .limit(1);
  const [save] = await db
    .select({ id: thriftSaves.id })
    .from(thriftSaves)
    .where(and(eq(thriftSaves.userId, me), eq(thriftSaves.listingId, row.id)))
    .limit(1);
  const [conv] = await db
    .select({ id: thriftConversations.id })
    .from(thriftConversations)
    .where(
      and(eq(thriftConversations.listingId, row.id), eq(thriftConversations.buyerUserId, me)),
    )
    .limit(1);

  res.json({
    listing: publicListing(row, seller?.name ?? null, Boolean(save)),
    isOwner: row.sellerUserId === me,
    conversationId: conv?.id ?? null,
  });
});

/* ------------------------------------------------------- seller: listings */

// GET /thrift/mine — the seller's own rack, grouped client-side by status.
router.get("/mine", async (req, res) => {
  const me = req.userId!;
  const rows = await db
    .select()
    .from(thriftListings)
    .where(and(eq(thriftListings.sellerUserId, me), ne(thriftListings.status, "removed" as const)))
    .orderBy(desc(thriftListings.createdAt));

  const ids = rows.map((r) => r.id);
  const counts = new Map<string, { conversations: number; unread: number }>();
  if (ids.length > 0) {
    const stats = await db
      .select({
        listingId: thriftConversations.listingId,
        conversations: sql<number>`count(distinct ${thriftConversations.id})::int`,
        unread: sql<number>`count(${thriftMessages.id}) filter (
          where ${thriftMessages.readAt} is null
          and ${thriftMessages.senderUserId} <> ${me}
        )::int`,
      })
      .from(thriftConversations)
      .leftJoin(thriftMessages, eq(thriftMessages.conversationId, thriftConversations.id))
      .where(inArray(thriftConversations.listingId, ids))
      .groupBy(thriftConversations.listingId);
    for (const s of stats) counts.set(s.listingId, { conversations: s.conversations, unread: s.unread });
  }

  res.json({
    listings: rows.map((r) => ({
      ...publicListing(r, null),
      conversations: counts.get(r.id)?.conversations ?? 0,
      unread: counts.get(r.id)?.unread ?? 0,
    })),
  });
});

const listingInput = z.object({
  clothId: z.string().uuid(),
  title: z.string().min(1).max(80),
  pricePaise: z.number().int().min(100).max(10_000_000),
  size: z.string().min(1).max(24),
  condition: z.enum(THRIFT_CONDITIONS),
  brand: z.string().max(40).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  deliveryPreference: z.enum(THRIFT_DELIVERY),
  city: z.string().max(60).nullable().optional(),
  status: z.enum(["draft", "active"]).default("active"),
});

// POST /thrift/listings — create from a wardrobe piece the caller owns. The
// image, category and style tag are read from the cloth row, never from the
// request, so a listing can only ever point at an image the seller already
// uploaded through the normal wardrobe path.
router.post("/listings", async (req, res) => {
  const parse = listingInput.safeParse(req.body ?? {});
  if (!parse.success) return res.status(400).json({ error: "Invalid listing" });
  const d = parse.data;
  const me = req.userId!;

  const [cloth] = await db.select().from(clothes).where(eq(clothes.id, d.clothId)).limit(1);
  if (!cloth) return res.status(404).json({ error: "Piece not found" });
  if (cloth.userId !== me) return res.status(403).json({ error: "That piece isn't yours" });

  const [existing] = await db
    .select({ id: thriftListings.id })
    .from(thriftListings)
    .where(
      and(
        eq(thriftListings.sourceClothId, cloth.id),
        inArray(thriftListings.status, ["draft", "active", "paused"] as const),
      ),
    )
    .limit(1);
  if (existing) {
    return res
      .status(409)
      .json({ error: "This piece is already listed", code: "ALREADY_LISTED", listingId: existing.id });
  }

  try {
    const [row] = await db
      .insert(thriftListings)
      .values({
        sellerUserId: me,
        sourceClothId: cloth.id,
        title: cleanText(d.title),
        pricePaise: d.pricePaise,
        size: cleanText(d.size),
        condition: d.condition,
        brand: d.brand ? cleanText(d.brand) : null,
        description: d.description ? cleanText(d.description) : null,
        deliveryPreference: d.deliveryPreference,
        city: d.city ? cleanText(d.city) : null,
        status: d.status,
        imageUrl: cloth.imageUrl,
        category: cloth.category,
        styleTag: cloth.styleTag,
      })
      .returning();
    res.status(201).json({ listing: publicListing(row, null) });
  } catch (err: any) {
    // The partial unique index is the real guard against a double submit.
    if (String(err?.message ?? "").includes("thrift_listings_one_open_idx")) {
      return res.status(409).json({ error: "This piece is already listed", code: "ALREADY_LISTED" });
    }
    throw err;
  }
});

const patchInput = z.object({
  title: z.string().min(1).max(80).optional(),
  pricePaise: z.number().int().min(100).max(10_000_000).optional(),
  size: z.string().min(1).max(24).optional(),
  condition: z.enum(THRIFT_CONDITIONS).optional(),
  brand: z.string().max(40).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  deliveryPreference: z.enum(THRIFT_DELIVERY).optional(),
  city: z.string().max(60).nullable().optional(),
  status: z.enum(["draft", "active", "paused"]).optional(),
  /** Required to bring a sold listing back to market. */
  confirmRelist: z.boolean().optional(),
});

router.patch("/listings/:id", async (req, res) => {
  const parse = patchInput.safeParse(req.body ?? {});
  if (!parse.success) return res.status(400).json({ error: "Invalid changes" });
  const d = parse.data;
  const me = req.userId!;

  const row = await loadListing(req.params.id);
  if (!row) return res.status(404).json({ error: "Listing not found" });
  if (row.sellerUserId !== me) return res.status(403).json({ error: "Not your listing" });
  if (row.status === "removed") return res.status(409).json({ error: "This listing was removed" });

  // Selling then quietly re-listing the same piece is exactly the pattern a
  // buyer would find misleading, so it takes an explicit confirmation.
  if (row.status === "sold" && d.status) {
    if (!d.confirmRelist) {
      return res
        .status(409)
        .json({ error: "Confirm you want to re-list a sold piece", code: "CONFIRM_RELIST" });
    }
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (d.title !== undefined) patch.title = cleanText(d.title);
  if (d.pricePaise !== undefined) patch.pricePaise = d.pricePaise;
  if (d.size !== undefined) patch.size = cleanText(d.size);
  if (d.condition !== undefined) patch.condition = d.condition;
  if (d.brand !== undefined) patch.brand = d.brand ? cleanText(d.brand) : null;
  if (d.description !== undefined) patch.description = d.description ? cleanText(d.description) : null;
  if (d.deliveryPreference !== undefined) patch.deliveryPreference = d.deliveryPreference;
  if (d.city !== undefined) patch.city = d.city ? cleanText(d.city) : null;
  if (d.status !== undefined) {
    patch.status = d.status;
    if (row.status === "sold") patch.soldAt = null;
  }

  const [updated] = await db
    .update(thriftListings)
    .set(patch)
    .where(eq(thriftListings.id, row.id))
    .returning();
  res.json({ listing: publicListing(updated, null) });
});

/** pause / activate / mark-sold / remove all funnel through one guarded path. */
async function setStatus(
  req: any,
  res: any,
  next: "paused" | "active" | "sold" | "removed",
) {
  const me = req.userId!;
  const row = await loadListing(req.params.id);
  if (!row) return res.status(404).json({ error: "Listing not found" });
  if (row.sellerUserId !== me) return res.status(403).json({ error: "Not your listing" });

  if (next === "active" && row.status === "sold" && req.body?.confirmRelist !== true) {
    return res
      .status(409)
      .json({ error: "Confirm you want to re-list a sold piece", code: "CONFIRM_RELIST" });
  }

  const [updated] = await db
    .update(thriftListings)
    .set({
      status: next,
      updatedAt: new Date(),
      soldAt: next === "sold" ? new Date() : row.status === "sold" ? null : row.soldAt,
    })
    .where(eq(thriftListings.id, row.id))
    .returning();

  // Conversations stay readable for history; they simply stop accepting new
  // messages. Nothing is deleted.
  if (next !== "active") {
    await db
      .update(thriftConversations)
      .set({ status: "closed", updatedAt: new Date() })
      .where(eq(thriftConversations.listingId, row.id));
  } else {
    await db
      .update(thriftConversations)
      .set({ status: "active", updatedAt: new Date() })
      .where(
        and(eq(thriftConversations.listingId, row.id), ne(thriftConversations.status, "blocked")),
      );
  }

  res.json({ listing: publicListing(updated, null) });
}

router.post("/listings/:id/pause", (req, res) => setStatus(req, res, "paused"));
router.post("/listings/:id/activate", (req, res) => setStatus(req, res, "active"));
router.post("/listings/:id/mark-sold", (req, res) => setStatus(req, res, "sold"));
router.delete("/listings/:id", (req, res) => setStatus(req, res, "removed"));

/* ---------------------------------------------------------------- saves */

router.post("/listings/:id/save", async (req, res) => {
  const me = req.userId!;
  const row = await loadListing(req.params.id);
  if (!row) return res.status(404).json({ error: "Listing not found" });
  await db
    .insert(thriftSaves)
    .values({ userId: me, listingId: row.id })
    .onConflictDoNothing();
  res.json({ saved: true });
});

router.delete("/listings/:id/save", async (req, res) => {
  await db
    .delete(thriftSaves)
    .where(and(eq(thriftSaves.userId, req.userId!), eq(thriftSaves.listingId, req.params.id)));
  res.json({ saved: false });
});

router.get("/saved", async (req, res) => {
  const me = req.userId!;
  const hidden = await hiddenUserIds(me);
  const where = [eq(thriftSaves.userId, me)];
  if (hidden.length > 0) where.push(notInArray(thriftListings.sellerUserId, hidden));

  const rows = await db
    .select({ listing: thriftListings, sellerName: users.name })
    .from(thriftSaves)
    .innerJoin(thriftListings, eq(thriftListings.id, thriftSaves.listingId))
    .innerJoin(users, eq(users.id, thriftListings.sellerUserId))
    .where(and(...where))
    .orderBy(desc(thriftSaves.createdAt));

  res.json({ listings: rows.map((r) => publicListing(r.listing, r.sellerName, true)) });
});

/* ------------------------------------------------------------ messaging */

// POST /thrift/listings/:id/conversation — idempotent: one conversation per
// (listing, buyer), so tapping "Message seller" twice reopens the same thread.
router.post("/listings/:id/conversation", async (req, res) => {
  const me = req.userId!;
  const row = await loadListing(req.params.id);
  if (!row) return res.status(404).json({ error: "Listing not found" });
  if (row.sellerUserId === me) {
    return res.status(400).json({ error: "This is your own listing", code: "OWN_LISTING" });
  }
  if (row.status !== "active") {
    return res.status(409).json({ error: CLOSED_MESSAGE[row.status] ?? "Listing unavailable" });
  }

  const hidden = await hiddenUserIds(me);
  if (hidden.includes(row.sellerUserId)) {
    return res.status(403).json({ error: "You can't message this seller" });
  }

  const [existing] = await db
    .select()
    .from(thriftConversations)
    .where(
      and(eq(thriftConversations.listingId, row.id), eq(thriftConversations.buyerUserId, me)),
    )
    .limit(1);
  if (existing) return res.json({ conversationId: existing.id, created: false });

  const [conv] = await db
    .insert(thriftConversations)
    .values({ listingId: row.id, buyerUserId: me, sellerUserId: row.sellerUserId })
    .returning();
  res.status(201).json({ conversationId: conv.id, created: true });
});

// GET /thrift/messages — every thread the caller is part of, either side.
router.get("/messages", async (req, res) => {
  const me = req.userId!;
  const hidden = await hiddenUserIds(me);

  const where = [
    or(eq(thriftConversations.buyerUserId, me), eq(thriftConversations.sellerUserId, me))!,
  ];
  if (hidden.length > 0) {
    where.push(notInArray(thriftConversations.buyerUserId, hidden));
    where.push(notInArray(thriftConversations.sellerUserId, hidden));
  }

  const rows = await db
    .select({
      conversation: thriftConversations,
      listing: thriftListings,
    })
    .from(thriftConversations)
    .innerJoin(thriftListings, eq(thriftListings.id, thriftConversations.listingId))
    .where(and(...where))
    .orderBy(desc(thriftConversations.updatedAt));

  const ids = rows.map((r) => r.conversation.id);
  const meta = new Map<string, { unread: number; last: string | null; lastAt: Date | null }>();
  if (ids.length > 0) {
    const stats = await db
      .select({
        conversationId: thriftMessages.conversationId,
        unread: sql<number>`count(*) filter (
          where ${thriftMessages.readAt} is null and ${thriftMessages.senderUserId} <> ${me}
        )::int`,
        last: sql<string | null>`(array_agg(${thriftMessages.body} order by ${thriftMessages.createdAt} desc))[1]`,
        lastAt: sql<Date | null>`max(${thriftMessages.createdAt})`,
      })
      .from(thriftMessages)
      .where(inArray(thriftMessages.conversationId, ids))
      .groupBy(thriftMessages.conversationId);
    for (const s of stats) {
      meta.set(s.conversationId, { unread: s.unread, last: s.last, lastAt: s.lastAt });
    }
  }

  const otherIds = [
    ...new Set(
      rows.map((r) =>
        r.conversation.buyerUserId === me ? r.conversation.sellerUserId : r.conversation.buyerUserId,
      ),
    ),
  ];
  const names = new Map<string, string>();
  if (otherIds.length > 0) {
    const people = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, otherIds));
    for (const p of people) names.set(p.id, p.name);
  }

  res.json({
    conversations: rows.map((r) => {
      const iAmBuyer = r.conversation.buyerUserId === me;
      const otherId = iAmBuyer ? r.conversation.sellerUserId : r.conversation.buyerUserId;
      const m = meta.get(r.conversation.id);
      return {
        id: r.conversation.id,
        status: r.conversation.status,
        role: iAmBuyer ? "buyer" : "seller",
        otherName: names.get(otherId) ?? "TryUnex member",
        otherUserId: otherId,
        unread: m?.unread ?? 0,
        lastMessage: m?.last ?? null,
        lastMessageAt: m?.lastAt ?? r.conversation.createdAt,
        listing: {
          id: r.listing.id,
          title: r.listing.title,
          imageUrl: r.listing.imageUrl,
          pricePaise: r.listing.pricePaise,
          status: r.listing.status,
        },
      };
    }),
  });
});

type ConversationLookup =
  | { ok: false; status: 404 | 403 }
  | { ok: true; conversation: ThriftConversation; listing: ThriftListing };

/** Loads a conversation and proves the caller belongs in it. */
async function loadConversation(conversationId: string, me: string): Promise<ConversationLookup> {
  const [row] = await db
    .select({ conversation: thriftConversations, listing: thriftListings })
    .from(thriftConversations)
    .innerJoin(thriftListings, eq(thriftListings.id, thriftConversations.listingId))
    .where(eq(thriftConversations.id, conversationId))
    .limit(1);
  if (!row) return { ok: false, status: 404 };
  const c = row.conversation;
  if (c.buyerUserId !== me && c.sellerUserId !== me) return { ok: false, status: 403 };
  return { ok: true, conversation: c, listing: row.listing };
}

router.get("/messages/:conversationId", async (req, res) => {
  const me = req.userId!;
  const found = await loadConversation(req.params.conversationId, me);
  if (!found.ok) {
    return res.status(found.status).json({ error: found.status === 404 ? "Not found" : "Not yours" });
  }
  const { conversation, listing } = found;

  const msgs = await db
    .select()
    .from(thriftMessages)
    .where(eq(thriftMessages.conversationId, conversation.id))
    .orderBy(asc(thriftMessages.createdAt))
    .limit(200);

  const otherId = conversation.buyerUserId === me ? conversation.sellerUserId : conversation.buyerUserId;
  const [other] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, otherId))
    .limit(1);

  const blocked = (await hiddenUserIds(me)).includes(otherId);
  const closed = listing.status !== "active" || conversation.status !== "active" || blocked;

  res.json({
    conversation: {
      id: conversation.id,
      status: conversation.status,
      role: conversation.buyerUserId === me ? "buyer" : "seller",
      otherName: other?.name ?? "TryUnex member",
      otherUserId: otherId,
      closed,
      closedReason: blocked
        ? "This conversation is closed."
        : listing.status !== "active"
          ? CLOSED_MESSAGE[listing.status] ?? "This listing is no longer available."
          : null,
      listing: {
        id: listing.id,
        title: listing.title,
        imageUrl: listing.imageUrl,
        pricePaise: listing.pricePaise,
        status: listing.status,
      },
    },
    messages: msgs.map((m) => ({
      id: m.id,
      body: m.body,
      mine: m.senderUserId === me,
      createdAt: m.createdAt,
      readAt: m.readAt,
    })),
  });
});

router.post("/messages/:conversationId", async (req, res) => {
  const parse = z.object({ body: z.string().min(1).max(1000) }).safeParse(req.body ?? {});
  if (!parse.success) return res.status(400).json({ error: "Write a message first" });
  const me = req.userId!;

  const found = await loadConversation(req.params.conversationId, me);
  if (!found.ok) {
    return res.status(found.status).json({ error: found.status === 404 ? "Not found" : "Not yours" });
  }
  const { conversation, listing } = found;

  const otherId = conversation.buyerUserId === me ? conversation.sellerUserId : conversation.buyerUserId;
  if ((await hiddenUserIds(me)).includes(otherId)) {
    return res.status(403).json({ error: "This conversation is closed." });
  }
  if (listing.status !== "active") {
    return res
      .status(409)
      .json({ error: CLOSED_MESSAGE[listing.status] ?? "This listing is no longer available." });
  }
  if (conversation.status !== "active") {
    return res.status(409).json({ error: "This conversation is closed." });
  }

  const body = cleanText(parse.data.body);
  if (!body) return res.status(400).json({ error: "Write a message first" });
  if (containsContactInfo(body)) {
    return res.status(400).json({
      error: "Phone numbers and email addresses can't be sent here. Arrange contact details once you both agree.",
      code: "CONTACT_INFO",
    });
  }

  const [msg] = await db
    .insert(thriftMessages)
    .values({ conversationId: conversation.id, senderUserId: me, body })
    .returning();
  await db
    .update(thriftConversations)
    .set({ updatedAt: new Date() })
    .where(eq(thriftConversations.id, conversation.id));

  res.status(201).json({
    message: { id: msg.id, body: msg.body, mine: true, createdAt: msg.createdAt, readAt: null },
  });
});

router.post("/messages/:conversationId/read", async (req, res) => {
  const me = req.userId!;
  const found = await loadConversation(req.params.conversationId, me);
  if (!found.ok) {
    return res.status(found.status).json({ error: found.status === 404 ? "Not found" : "Not yours" });
  }
  await db
    .update(thriftMessages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(thriftMessages.conversationId, found.conversation.id),
        ne(thriftMessages.senderUserId, me),
        sql`${thriftMessages.readAt} is null`,
      ),
    );
  res.json({ ok: true });
});

/* --------------------------------------------------- reporting, blocking */

router.post("/listings/:id/report", async (req, res) => {
  const parse = z
    .object({
      reason: z.enum(LISTING_REPORT_REASONS),
      note: z.string().max(500).nullable().optional(),
    })
    .safeParse(req.body ?? {});
  if (!parse.success) return res.status(400).json({ error: "Pick a reason" });

  const row = await loadListing(req.params.id);
  if (!row) return res.status(404).json({ error: "Listing not found" });

  // One report per person per listing. A report never changes the listing —
  // moderation is a human decision, so nothing is auto-hidden here.
  await db
    .insert(thriftListingReports)
    .values({
      reporterUserId: req.userId!,
      listingId: row.id,
      reason: parse.data.reason,
      note: parse.data.note ? cleanText(parse.data.note) : null,
    })
    .onConflictDoNothing();
  res.json({ reported: true });
});

router.post("/messages/:conversationId/report", async (req, res) => {
  const parse = z
    .object({
      reason: z.enum(CONVERSATION_REPORT_REASONS),
      note: z.string().max(500).nullable().optional(),
    })
    .safeParse(req.body ?? {});
  if (!parse.success) return res.status(400).json({ error: "Pick a reason" });

  const found = await loadConversation(req.params.conversationId, req.userId!);
  if (!found.ok) {
    return res.status(found.status).json({ error: found.status === 404 ? "Not found" : "Not yours" });
  }

  await db
    .insert(thriftConversationReports)
    .values({
      reporterUserId: req.userId!,
      conversationId: found.conversation.id,
      reason: parse.data.reason,
      note: parse.data.note ? cleanText(parse.data.note) : null,
    })
    .onConflictDoNothing();
  res.json({ reported: true });
});

router.post("/users/:userId/block", async (req, res) => {
  const me = req.userId!;
  const target = req.params.userId;
  if (target === me) return res.status(400).json({ error: "You can't block yourself" });

  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.id, target)).limit(1);
  if (!exists) return res.status(404).json({ error: "User not found" });

  await db
    .insert(thriftBlocks)
    .values({ blockerUserId: me, blockedUserId: target })
    .onConflictDoNothing();

  // Existing threads between the two go read-only. They are kept, not deleted,
  // so a report can still be investigated afterwards.
  await db
    .update(thriftConversations)
    .set({ status: "blocked", updatedAt: new Date() })
    .where(
      or(
        and(eq(thriftConversations.buyerUserId, me), eq(thriftConversations.sellerUserId, target)),
        and(eq(thriftConversations.buyerUserId, target), eq(thriftConversations.sellerUserId, me)),
      ),
    );

  res.json({ blocked: true });
});

router.delete("/users/:userId/block", async (req, res) => {
  await db
    .delete(thriftBlocks)
    .where(
      and(
        eq(thriftBlocks.blockerUserId, req.userId!),
        eq(thriftBlocks.blockedUserId, req.params.userId),
      ),
    );
  res.json({ blocked: false });
});

export default router;
