import { db } from "./utils";
import { chat, message } from "./schema";
import { eq, desc } from "drizzle-orm";

export async function getChatsByUserId(userId: string) {
  return await db
    .select()
    .from(chat)
    .where(eq(chat.userId, userId))
    .orderBy(desc(chat.createdAt));
}

export async function getChatById(chatId: string) {
  const result = await db.select().from(chat).where(eq(chat.id, chatId));
  return result[0] || null;
}

export async function createChat(userId: string, title: string) {
  const result = await db
    .insert(chat)
    .values({
      userId,
      title,
      createdAt: new Date(),
    })
    .returning();
  return result[0];
}

export async function updateChatTitle(chatId: string, title: string) {
  await db.update(chat).set({ title }).where(eq(chat.id, chatId));
}

export async function deleteChat(chatId: string) {
  await db.delete(chat).where(eq(chat.id, chatId));
}

export async function getMessagesByChatId(chatId: string) {
  return await db
    .select()
    .from(message)
    .where(eq(message.chatId, chatId))
    .orderBy(message.timestamp);
}

export async function createMessage(
  chatId: string,
  text: string,
  sender: "user" | "bot"
) {
  const result = await db
    .insert(message)
    .values({
      chatId,
      text,
      sender,
      timestamp: new Date(),
    })
    .returning();
  return result[0];
}
