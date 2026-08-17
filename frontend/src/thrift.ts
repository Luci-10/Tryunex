import { api, type Cloth, type StyleTag } from "./api";

/* ---------------------------------------------------------------- types */

export type Condition = "like_new" | "gently_used" | "used";
export type Delivery = "pickup" | "shipping" | "either";
export type ListingStatus = "draft" | "active" | "paused" | "sold" | "removed";

export type Listing = {
  id: string;
  title: string;
  pricePaise: number;
  currency: string;
  size: string;
  condition: Condition;
  brand: string | null;
  description: string | null;
  deliveryPreference: Delivery;
  city: string | null;
  status: ListingStatus;
  imageUrl: string;
  category: string;
  styleTag: StyleTag | null;
  createdAt: string;
  soldAt: string | null;
  sellerUserId: string;
  sellerName: string;
  sourceClothId: string;
  saved: boolean;
};

export type SellerListing = Listing & { conversations: number; unread: number };

export type ConversationSummary = {
  id: string;
  status: "active" | "closed" | "blocked";
  role: "buyer" | "seller";
  otherName: string;
  otherUserId: string;
  unread: number;
  lastMessage: string | null;
  lastMessageAt: string;
  listing: { id: string; title: string; imageUrl: string; pricePaise: number; status: ListingStatus };
};

export type Message = {
  id: string;
  body: string;
  mine: boolean;
  createdAt: string;
  readAt: string | null;
};

export type ConversationDetail = {
  id: string;
  status: "active" | "closed" | "blocked";
  role: "buyer" | "seller";
  otherName: string;
  otherUserId: string;
  closed: boolean;
  closedReason: string | null;
  listing: { id: string; title: string; imageUrl: string; pricePaise: number; status: ListingStatus };
};

/* ---------------------------------------------------------- presentation */

export const CONDITION_LABEL: Record<Condition, string> = {
  like_new: "Like new",
  gently_used: "Gently used",
  used: "Used",
};

/** Tones read as a scale: mint is best condition, peach is most worn. */
export const CONDITION_TONE: Record<Condition, "mint" | "sky" | "peach"> = {
  like_new: "mint",
  gently_used: "sky",
  used: "peach",
};

export const DELIVERY_LABEL: Record<Delivery, string> = {
  pickup: "Local pickup",
  shipping: "Shipping",
  either: "Pickup or shipping",
};

export const STATUS_LABEL: Record<ListingStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  sold: "Sold",
  removed: "Removed",
};

export const STATUS_TONE: Record<ListingStatus, "mint" | "butter" | "ink" | "lilac" | "coral"> = {
  draft: "ink",
  active: "mint",
  paused: "butter",
  sold: "lilac",
  removed: "coral",
};

export const CATEGORY_LABEL: Record<string, string> = {
  top: "Tops",
  bottom: "Bottoms",
  dress: "Dresses",
  outerwear: "Outerwear",
  shoes: "Shoes",
  accessory: "Accessories",
  other: "Other",
};

export const LISTING_REPORT_REASONS: { value: string; label: string }[] = [
  { value: "not_as_described", label: "Item not as described" },
  { value: "prohibited", label: "Prohibited item" },
  { value: "spam", label: "Spam" },
  { value: "inappropriate", label: "Inappropriate image or content" },
  { value: "scam", label: "Suspected scam" },
  { value: "other", label: "Other" },
];

export const CONVERSATION_REPORT_REASONS: { value: string; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "scam", label: "Suspected scam" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Other" },
];

export type SaleStatus = "pending" | "completed" | "cancelled" | "refunded";

export type Sale = {
  id: string;
  status: SaleStatus;
  role: "buyer" | "seller";
  createdAt: string;
  completedAt: string | null;
  listing: { title: string; imageUrl: string; pricePaise: number };
};

/** The one line that must appear wherever a sale is confirmed. */
export const NO_ESCROW_NOTE =
  "TryUnex does not hold payment, verify delivery, or provide buyer protection. Arrange payment and delivery directly with each other, and only confirm once you consider that done.";

export const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "Free size"];

/** The one line that has to appear wherever money is discussed. */
export const PAYMENT_NOTE =
  "Payment and delivery are arranged directly between buyer and seller.";

/** Prices are stored in paise and shown in whole rupees. */
export function formatPrice(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: rupees % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "Today", "3 days ago" — no "Listed" prefix, so it can label a row too. */
export function listedOn(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function listedAgo(iso: string): string {
  const on = listedOn(iso);
  return /^(Today|Yesterday)$/.test(on) ? `Listed ${on.toLowerCase()}` : `Listed ${on}`;
}

export function messageTime(iso: string): string {
  const d = new Date(iso);
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * A listing rendered as a wardrobe piece, so it can enter the existing Try-on
 * look with no changes to the rules engine.
 *
 * The id is the *source cloth* id, not the listing id — that is what the
 * generate endpoint resolves, and it is also what stops the same garment being
 * added twice via two different routes.
 */
export function listingAsCloth(l: Listing): Cloth {
  return {
    id: l.sourceClothId,
    userId: l.sellerUserId,
    name: l.title,
    category: l.category,
    styleTag: l.styleTag ?? undefined,
    imageUrl: l.imageUrl,
    status: "clean",
    createdAt: l.createdAt,
  };
}

/** A listing can only be previewed while it is genuinely on the market. */
export function canTryOn(l: Listing): boolean {
  return l.status === "active" && Boolean(l.imageUrl) && Boolean(l.sourceClothId);
}

/* ------------------------------------------------------------------ api */

export type BrowseFilters = {
  q?: string;
  category?: string;
  styleTag?: string;
  condition?: string;
  size?: string;
  delivery?: string;
  city?: string;
  minPaise?: number;
  maxPaise?: number;
  sort?: "newest" | "price_asc" | "price_desc";
  mine?: boolean;
  limit?: number;
  offset?: number;
};

function query(f: BrowseFilters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === "") continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const thrift = {
  browse: (f: BrowseFilters = {}) =>
    api.get<{ listings: Listing[]; hasMore: boolean }>(`/thrift/listings${query(f)}`),

  detail: (id: string) =>
    api.get<{ listing: Listing; isOwner: boolean; conversationId: string | null }>(
      `/thrift/listings/${id}`,
    ),

  mine: () => api.get<{ listings: SellerListing[] }>("/thrift/mine"),

  create: (body: Record<string, unknown>) =>
    api.post<{ listing: Listing }>("/thrift/listings", body),

  update: (id: string, body: Record<string, unknown>) =>
    api.patch<{ listing: Listing }>(`/thrift/listings/${id}`, body),

  pause: (id: string) => api.post<{ listing: Listing }>(`/thrift/listings/${id}/pause`),
  activate: (id: string, confirmRelist = false) =>
    api.post<{ listing: Listing }>(`/thrift/listings/${id}/activate`, { confirmRelist }),
  markSold: (id: string) => api.post<{ listing: Listing }>(`/thrift/listings/${id}/mark-sold`),
  remove: (id: string) => api.delete<{ listing: Listing }>(`/thrift/listings/${id}`),

  save: (id: string) => api.post<{ saved: boolean }>(`/thrift/listings/${id}/save`),
  unsave: (id: string) => api.delete<{ saved: boolean }>(`/thrift/listings/${id}/save`),
  saved: () => api.get<{ listings: Listing[] }>("/thrift/saved"),

  startConversation: (listingId: string) =>
    api.post<{ conversationId: string; created: boolean }>(
      `/thrift/listings/${listingId}/conversation`,
    ),
  conversations: () => api.get<{ conversations: ConversationSummary[] }>("/thrift/messages"),
  conversation: (id: string) =>
    api.get<{ conversation: ConversationDetail; messages: Message[] }>(`/thrift/messages/${id}`),
  send: (id: string, body: string) =>
    api.post<{ message: Message }>(`/thrift/messages/${id}`, { body }),
  markRead: (id: string) => api.post<{ ok: true }>(`/thrift/messages/${id}/read`),

  /** Seller records a sale to a buyer who has messaged them about the piece. */
  recordSale: (listingId: string, buyerUserId: string) =>
    api.post<{ transactionId: string; status: SaleStatus }>(
      `/thrift/listings/${listingId}/sell`,
      { buyerUserId },
    ),

  /** Buyer confirms they have received it. This completes the sale and moves
   *  the garment into their wardrobe. */
  confirmReceived: (transactionId: string) =>
    api.post<{ status: SaleStatus; clothId: string; alreadyTransferred: boolean }>(
      `/thrift/transactions/${transactionId}/confirm`,
    ),

  cancelSale: (transactionId: string) =>
    api.post<{ status: SaleStatus }>(`/thrift/transactions/${transactionId}/cancel`),

  sales: () => api.get<{ transactions: Sale[] }>("/thrift/transactions"),

  reportListing: (id: string, reason: string, note?: string) =>
    api.post<{ reported: true }>(`/thrift/listings/${id}/report`, { reason, note: note || null }),
  reportConversation: (id: string, reason: string, note?: string) =>
    api.post<{ reported: true }>(`/thrift/messages/${id}/report`, { reason, note: note || null }),
  block: (userId: string) => api.post<{ blocked: true }>(`/thrift/users/${userId}/block`),
  unblock: (userId: string) => api.delete<{ blocked: false }>(`/thrift/users/${userId}/block`),
};
