import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  pgEnum,
  uniqueIndex,
  index,
  date,
  boolean,
} from "drizzle-orm/pg-core";

export const clothStatusEnum = pgEnum("cloth_status", ["clean", "worn"]);
export const permissionEnum = pgEnum("share_permission", ["view", "suggest", "edit"]);
export const suggestionStatusEnum = pgEnum("suggestion_status", [
  "pending",
  "accepted",
  "declined",
]);
export const genderEnum = pgEnum("gender", ["male", "female", "other", "prefer_not_to_say"]);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    dob: date("dob"),
    gender: genderEnum("gender"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
  }),
);

export const clothes = pgTable(
  "clothes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull().default("other"),
    imageUrl: text("image_url").notNull(),
    status: clothStatusEnum("status").notNull().default("clean"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("clothes_user_idx").on(t.userId),
  }),
);

export const wearEvents = pgTable(
  "wear_events",
  {
    id: serial("id").primaryKey(),
    clothId: integer("cloth_id").notNull().references(() => clothes.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    wornOn: date("worn_on").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("wear_user_idx").on(t.userId),
    dateIdx: index("wear_date_idx").on(t.wornOn),
  }),
);

export const shareCodes = pgTable(
  "share_codes",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    permission: permissionEnum("permission").notNull().default("suggest"),
    used: boolean("used").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    codeIdx: uniqueIndex("share_codes_code_idx").on(t.code),
  }),
);

export const shares = pgTable(
  "shares",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    viewerId: integer("viewer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    permission: permissionEnum("permission").notNull().default("suggest"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    pairIdx: uniqueIndex("shares_pair_idx").on(t.ownerId, t.viewerId),
  }),
);

export const suggestions = pgTable("suggestions", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  suggesterId: integer("suggester_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clothIds: text("cloth_ids").notNull(), // CSV
  note: text("note"),
  forDate: date("for_date"),
  status: suggestionStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type Cloth = typeof clothes.$inferSelect;
export type Share = typeof shares.$inferSelect;
export type Suggestion = typeof suggestions.$inferSelect;
