import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { InferSelectModel } from "drizzle-orm";

export const user = pgTable("users", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable("Chat", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  title: text("title").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  visibility: varchar("visibility", { enum: ["private", "public"] })
    .notNull()
    .default("private"),
  createdAt: timestamp("created_at").notNull(),
});

export type Chat = InferSelectModel<typeof chat>;

export const message = pgTable("Message", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  text: text("text").notNull(),
  sender: varchar("sender", { enum: ["user", "bot"] }).notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export type Message = InferSelectModel<typeof message>;
