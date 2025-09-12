import {
	pgTable,
	serial,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { InferSelectModel } from "drizzle-orm";

export const user = pgTable("users", {
	id: uuid("id").primaryKey().notNull().defaultRandom(),
	email: text("email").notNull().unique(),
	name: text("name").notNull(),
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
		.default("private"), // 'private' | 'public'
    createdAt: timestamp("created_at").notNull(),
});

export type Chat = InferSelectModel<typeof chat>;
