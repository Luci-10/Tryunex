import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
  date,
  boolean,
  integer,
  uuid,
} from "drizzle-orm/pg-core";

export const clothStatusEnum = pgEnum("cloth_status", ["clean", "worn"]);
export const permissionEnum = pgEnum("share_permission", ["view", "suggest", "edit"]);
export const suggestionStatusEnum = pgEnum("suggestion_status", [
  "pending",
  "accepted",
  "declined",
]);
export const genderEnum = pgEnum("gender", ["male", "female", "other", "prefer_not_to_say"]);

// Primary style/formality label for a garment. A real enum column rather
// than a delimited string, so it can be filtered and validated in the DB.
/** Shared with the API validators so the enum is defined exactly once. */
export const STYLE_TAGS = [
  "casual",
  "smart_casual",
  "formal",
  "party",
  "sports",
  "lounge",
  "traditional",
  "other",
] as const;

export const styleTagEnum = pgEnum("style_tag", [
  "casual",
  "smart_casual",
  "formal",
  "party",
  "sports",
  "lounge",
  "traditional",
  "other",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    dob: date("dob"),
    gender: text("gender"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
  }),
);

export const clothes = pgTable(
  "clothes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull().default("other"),
    imageUrl: text("image_url").notNull(),
    status: clothStatusEnum("status").notNull().default("clean"),
    // NOT NULL with a default so existing rows are backfilled by the
    // migration and older clients that never send it keep working.
    styleTag: styleTagEnum("style_tag").notNull().default("casual"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("clothes_user_idx").on(t.userId),
  }),
);

export const wearEvents = pgTable(
  "wear_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clothId: uuid("cloth_id").notNull().references(() => clothes.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    wornOn: date("worn_on").notNull(),
    // false = future plan, not yet processed; true = past wear, already
    // reflected in clothes.status. Lets us auto-flip planned → worn when
    // the date passes without re-marking clothes after the laundry reset.
    settled: boolean("settled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("wear_user_idx").on(t.userId),
    dateIdx: index("wear_date_idx").on(t.wornOn),
  }),
);

export const shareCodes = pgTable(
  "share_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    permission: permissionEnum("permission").notNull().default("suggest"),
    // Orthogonal to permission: lets the friend try owner's clothes on themselves.
    allowTryon: boolean("allow_tryon").notNull().default(false),
    used: boolean("used").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    codeIdx: uniqueIndex("share_codes_code_idx").on(t.code),
  }),
);

export const shares = pgTable(
  "shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    viewerId: uuid("viewer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    permission: permissionEnum("permission").notNull().default("suggest"),
    allowTryon: boolean("allow_tryon").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pairIdx: uniqueIndex("shares_pair_idx").on(t.ownerId, t.viewerId),
  }),
);

export const suggestions = pgTable("suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  suggesterId: uuid("suggester_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clothIds: text("cloth_ids").notNull(), // CSV
  note: text("note"),
  forDate: date("for_date"),
  status: suggestionStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Try-on assets — both the user's reference selfie(s) and generated try-on
// results. type='selfie' rows have no cloth_id; type='result' rows reference
// the cloth used. "Current" selfie = newest type='selfie' row for the user.
export const tryonAssets = pgTable("tryon_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'selfie' | 'result'
  imageUrl: text("image_url").notNull(),
  clothId: uuid("cloth_id").references(() => clothes.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type Cloth = typeof clothes.$inferSelect;
export type Share = typeof shares.$inferSelect;
export type Suggestion = typeof suggestions.$inferSelect;
export type TryonAsset = typeof tryonAssets.$inferSelect;

/* ------------------------------------------------------------ billing */

export const tierEnum = pgEnum("billing_tier", ["free", "lite", "plus", "style"]);
export const subStatusEnum = pgEnum("subscription_status", [
  "none", "pending", "active", "past_due", "cancelled", "expired",
]);
export const ledgerTypeEnum = pgEnum("credit_ledger_type", [
  "free_monthly_grant", "pack_purchase_grant", "subscription_grant",
  "tryon_debit", "regenerate_debit", "generation_refund",
  "admin_adjustment", "expiry",
]);
export const creditSourceEnum = pgEnum("credit_source", [
  "free", "pack", "subscription", "tryon", "regenerate", "refund",
]);
export const paymentKindEnum = pgEnum("payment_kind", ["pack", "subscription"]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "created", "pending", "paid", "failed", "refunded", "cancelled",
]);

export const billingProfiles = pgTable(
  "billing_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    currentTier: tierEnum("current_tier").notNull().default("free"),
    subscriptionStatus: subStatusEnum("subscription_status").notNull().default("none"),
    razorpayCustomerId: text("razorpay_customer_id"),
    razorpaySubscriptionId: text("razorpay_subscription_id"),
    subscriptionStartedAt: timestamp("subscription_started_at", { withTimezone: true }),
    subscriptionCurrentPeriodStart: timestamp("subscription_current_period_start", { withTimezone: true }),
    subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end", { withTimezone: true }),
    subscriptionCancelledAt: timestamp("subscription_cancelled_at", { withTimezone: true }),
    freeAllowancePeriodStart: timestamp("free_allowance_period_start", { withTimezone: true }),
    freeAllowancePeriodEnd: timestamp("free_allowance_period_end", { withTimezone: true }),
    freeChatPeriodStart: timestamp("free_chat_period_start", { withTimezone: true }),
    freeChatPeriodEnd: timestamp("free_chat_period_end", { withTimezone: true }),
    freeChatUsed: integer("free_chat_used").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ userIdx: uniqueIndex("billing_profiles_user_idx").on(t.userId) }),
);

/** Immutable. A balance is always SUM(credit_amount) over unexpired rows. */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: ledgerTypeEnum("type").notNull(),
    creditAmount: integer("credit_amount").notNull(),
    sourceType: creditSourceEnum("source_type").notNull(),
    productCode: text("product_code"),
    relatedTryonId: uuid("related_tryon_id"),
    relatedPaymentId: uuid("related_payment_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    keyIdx: uniqueIndex("credit_ledger_idem_idx").on(t.idempotencyKey),
    userIdx: index("credit_ledger_user_idx").on(t.userId),
    expiryIdx: index("credit_ledger_expiry_idx").on(t.userId, t.expiresAt),
    createdIdx: index("credit_ledger_created_idx").on(t.userId, t.createdAt),
  }),
);

/* ------------------------------------------------- thrift marketplace */

export const listingConditionEnum = pgEnum("thrift_condition", [
  "like_new",
  "gently_used",
  "used",
]);
export const listingDeliveryEnum = pgEnum("thrift_delivery", ["pickup", "shipping", "either"]);
export const listingStatusEnum = pgEnum("thrift_listing_status", [
  "draft",
  "active",
  "paused",
  "sold",
  "removed",
]);
export const conversationStatusEnum = pgEnum("thrift_conversation_status", [
  "active",
  "closed",
  "blocked",
]);
export const reportStatusEnum = pgEnum("thrift_report_status", [
  "open",
  "reviewed",
  "resolved",
  "dismissed",
]);

export const THRIFT_CONDITIONS = ["like_new", "gently_used", "used"] as const;
export const THRIFT_DELIVERY = ["pickup", "shipping", "either"] as const;
export const THRIFT_LISTING_STATUS = ["draft", "active", "paused", "sold", "removed"] as const;
export const LISTING_REPORT_REASONS = [
  "not_as_described",
  "prohibited",
  "spam",
  "inappropriate",
  "scam",
  "other",
] as const;
export const CONVERSATION_REPORT_REASONS = [
  "spam",
  "harassment",
  "scam",
  "inappropriate",
  "other",
] as const;

/**
 * A peer-to-peer resale listing for a garment the seller already owns in their
 * wardrobe. `sourceClothId` is the link back — the listing never copies the
 * image into new storage, it points at the same R2 object the wardrobe uses.
 * Money is recorded in paise, matching `payments.amountPaise`, so there is one
 * currency convention in the codebase.
 */
export const thriftListings = pgTable(
  "thrift_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerUserId: uuid("seller_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sourceClothId: uuid("source_cloth_id").notNull().references(() => clothes.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    pricePaise: integer("price_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    size: text("size").notNull(),
    condition: listingConditionEnum("condition").notNull(),
    brand: text("brand"),
    description: text("description"),
    deliveryPreference: listingDeliveryEnum("delivery_preference").notNull(),
    /** City only. The API never accepts or stores a street address. */
    city: text("city"),
    status: listingStatusEnum("status").notNull().default("active"),
    /** Denormalised from the cloth so browse needs no join, and so the card
     *  keeps working if the seller later renames or recategorises the piece. */
    imageUrl: text("image_url").notNull(),
    category: text("category").notNull(),
    styleTag: styleTagEnum("style_tag"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    soldAt: timestamp("sold_at", { withTimezone: true }),
  },
  (t) => ({
    sellerIdx: index("thrift_listings_seller_idx").on(t.sellerUserId),
    browseIdx: index("thrift_listings_browse_idx").on(t.status, t.createdAt),
    categoryIdx: index("thrift_listings_category_idx").on(t.status, t.category),
    priceIdx: index("thrift_listings_price_idx").on(t.status, t.pricePaise),
    styleIdx: index("thrift_listings_style_idx").on(t.status, t.styleTag),
    sizeIdx: index("thrift_listings_size_idx").on(t.status, t.size),
    clothIdx: index("thrift_listings_cloth_idx").on(t.sourceClothId),
  }),
);

export const thriftSaves = pgTable(
  "thrift_saves",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id").notNull().references(() => thriftListings.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pairIdx: uniqueIndex("thrift_saves_pair_idx").on(t.userId, t.listingId),
    userIdx: index("thrift_saves_user_idx").on(t.userId),
  }),
);

export const thriftConversations = pgTable(
  "thrift_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id").notNull().references(() => thriftListings.id, { onDelete: "cascade" }),
    buyerUserId: uuid("buyer_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sellerUserId: uuid("seller_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: conversationStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pairIdx: uniqueIndex("thrift_conversations_pair_idx").on(t.listingId, t.buyerUserId),
    buyerIdx: index("thrift_conversations_buyer_idx").on(t.buyerUserId, t.updatedAt),
    sellerIdx: index("thrift_conversations_seller_idx").on(t.sellerUserId, t.updatedAt),
  }),
);

export const thriftMessages = pgTable(
  "thrift_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => thriftConversations.id, { onDelete: "cascade" }),
    senderUserId: uuid("sender_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => ({
    convIdx: index("thrift_messages_conv_idx").on(t.conversationId, t.createdAt),
  }),
);

export const thriftListingReports = pgTable(
  "thrift_listing_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterUserId: uuid("reporter_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id").notNull().references(() => thriftListings.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    note: text("note"),
    status: reportStatusEnum("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    listingIdx: index("thrift_listing_reports_listing_idx").on(t.listingId),
    onePerReporter: uniqueIndex("thrift_listing_reports_once_idx").on(t.reporterUserId, t.listingId),
  }),
);

export const thriftConversationReports = pgTable(
  "thrift_conversation_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterUserId: uuid("reporter_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull().references(() => thriftConversations.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    note: text("note"),
    status: reportStatusEnum("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    convIdx: index("thrift_conversation_reports_conv_idx").on(t.conversationId),
    onePerReporter: uniqueIndex("thrift_conversation_reports_once_idx").on(
      t.reporterUserId,
      t.conversationId,
    ),
  }),
);

/** Directional. A block hides each party from the other in the marketplace. */
export const thriftBlocks = pgTable(
  "thrift_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blockerUserId: uuid("blocker_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    blockedUserId: uuid("blocked_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pairIdx: uniqueIndex("thrift_blocks_pair_idx").on(t.blockerUserId, t.blockedUserId),
    blockedIdx: index("thrift_blocks_blocked_idx").on(t.blockedUserId),
  }),
);

export type ThriftListing = typeof thriftListings.$inferSelect;
export type ThriftConversation = typeof thriftConversations.$inferSelect;
export type ThriftMessage = typeof thriftMessages.$inferSelect;

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("razorpay"),
    productCode: text("product_code").notNull(),
    kind: paymentKindEnum("kind").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    razorpayOrderId: text("razorpay_order_id"),
    razorpayPaymentId: text("razorpay_payment_id"),
    razorpaySubscriptionId: text("razorpay_subscription_id"),
    status: paymentStatusEnum("status").notNull().default("created"),
    webhookEventId: text("webhook_event_id"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("payments_user_idx").on(t.userId),
    orderIdx: uniqueIndex("payments_order_idx").on(t.razorpayOrderId),
    eventIdx: uniqueIndex("payments_event_idx").on(t.webhookEventId),
  }),
);
