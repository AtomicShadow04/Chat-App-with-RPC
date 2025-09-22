import { db, withDatabaseConnection, DatabaseError } from "./utils";
import { chat, message, user, type User } from "./schema";
import { eq, desc } from "drizzle-orm";

// Input validation helpers
const validateUserId = (userId: string): void => {
  if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
    throw new DatabaseError("Invalid user ID provided");
  }
};

const validateChatId = (chatId: string): void => {
  if (!chatId || typeof chatId !== "string" || chatId.trim().length === 0) {
    throw new DatabaseError("Invalid chat ID provided");
  }
};

const validateEmail = (email: string): void => {
  if (!email || typeof email !== "string" || !email.includes("@")) {
    throw new DatabaseError("Invalid email address provided");
  }
};

// Chat queries with enhanced error handling
export async function getChatsByUserId(userId: string) {
  validateUserId(userId);

  return await withDatabaseConnection(async () => {
    try {
      const chats = await db
        .select()
        .from(chat)
        .where(eq(chat.userId, userId))
        .orderBy(desc(chat.createdAt));

      return chats;
    } catch (error) {
      console.error(`Failed to get chats for user ${userId}:`, error);
      throw error;
    }
  });
}

export async function getChatById(chatId: string) {
  validateChatId(chatId);

  return await withDatabaseConnection(async () => {
    try {
      const result = await db.select().from(chat).where(eq(chat.id, chatId));
      return result[0] || null;
    } catch (error) {
      console.error(`Failed to get chat ${chatId}:`, error);
      throw error;
    }
  });
}

export async function createChat(userId: string, title: string) {
  validateUserId(userId);

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    throw new DatabaseError("Chat title is required");
  }

  if (title.length > 255) {
    throw new DatabaseError("Chat title is too long (maximum 255 characters)");
  }

  return await withDatabaseConnection(async () => {
    try {
      const result = await db
        .insert(chat)
        .values({
          userId,
          title: title.trim(),
          createdAt: new Date(),
        })
        .returning();

      if (!result[0]) {
        throw new DatabaseError("Failed to create chat");
      }

      return result[0];
    } catch (error) {
      console.error(`Failed to create chat for user ${userId}:`, error);
      throw error;
    }
  });
}

export async function updateChatTitle(chatId: string, title: string) {
  validateChatId(chatId);

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    throw new DatabaseError("Chat title is required");
  }

  if (title.length > 255) {
    throw new DatabaseError("Chat title is too long (maximum 255 characters)");
  }

  return await withDatabaseConnection(async () => {
    try {
      const result = await db
        .update(chat)
        .set({ title: title.trim() })
        .where(eq(chat.id, chatId))
        .returning();

      return result[0] || null;
    } catch (error) {
      console.error(`Failed to update chat title for ${chatId}:`, error);
      throw error;
    }
  });
}

export async function deleteChat(chatId: string) {
  validateChatId(chatId);

  return await withDatabaseConnection(async () => {
    try {
      // First delete associated messages
      await db.delete(message).where(eq(message.chatId, chatId));

      // Then delete the chat
      const result = await db
        .delete(chat)
        .where(eq(chat.id, chatId))
        .returning();

      return result.length > 0;
    } catch (error) {
      console.error(`Failed to delete chat ${chatId}:`, error);
      throw error;
    }
  });
}

// Message queries with enhanced error handling
export async function getMessagesByChatId(chatId: string) {
  validateChatId(chatId);

  return await withDatabaseConnection(async () => {
    try {
      const messages = await db
        .select()
        .from(message)
        .where(eq(message.chatId, chatId))
        .orderBy(message.timestamp);

      return messages;
    } catch (error) {
      console.error(`Failed to get messages for chat ${chatId}:`, error);
      throw error;
    }
  });
}

export async function createMessage(
  chatId: string,
  text: string,
  sender: "user" | "bot"
) {
  validateChatId(chatId);

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    throw new DatabaseError("Message text is required");
  }

  if (text.length > 10000) {
    throw new DatabaseError("Message is too long (maximum 10,000 characters)");
  }

  if (!["user", "bot"].includes(sender)) {
    throw new DatabaseError("Invalid sender type");
  }

  return await withDatabaseConnection(async () => {
    try {
      // Verify chat exists
      const chatExists = await getChatById(chatId);
      if (!chatExists) {
        throw new DatabaseError("Chat not found");
      }

      const result = await db
        .insert(message)
        .values({
          chatId,
          text: text.trim(),
          sender,
          timestamp: new Date(),
        })
        .returning();

      if (!result[0]) {
        throw new DatabaseError("Failed to create message");
      }

      return result[0];
    } catch (error) {
      console.error(`Failed to create message for chat ${chatId}:`, error);
      throw error;
    }
  });
}

// User queries with enhanced error handling
export async function createUser(
  email: string,
  password: string,
  name: string
) {
  validateEmail(email);

  if (!password || typeof password !== "string" || password.length < 6) {
    throw new DatabaseError("Password must be at least 6 characters long");
  }

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    throw new DatabaseError("User name is required");
  }

  if (name.length > 100) {
    throw new DatabaseError("User name is too long (maximum 100 characters)");
  }

  return await withDatabaseConnection(async () => {
    try {
      // Check if user already exists
      const existingUser = await getUserByEmail(email);
      if (existingUser) {
        throw new DatabaseError("User with this email already exists");
      }

      const result = await db
        .insert(user)
        .values({
          email: email.toLowerCase().trim(),
          password,
          name: name.trim(),
          createdAt: new Date(),
        })
        .returning();

      if (!result[0]) {
        throw new DatabaseError("Failed to create user");
      }

      return result[0];
    } catch (error) {
      console.error(`Failed to create user ${email}:`, error);
      throw error;
    }
  });
}

export async function getUserByEmail(email: string) {
  validateEmail(email);

  return await withDatabaseConnection(async () => {
    try {
      const result = await db
        .select()
        .from(user)
        .where(eq(user.email, email.toLowerCase().trim()));

      return result[0] || null;
    } catch (error) {
      console.error(`Failed to get user by email ${email}:`, error);
      throw error;
    }
  });
}

export async function getUserById(userId: string) {
  validateUserId(userId);

  return await withDatabaseConnection(async () => {
    try {
      const result = await db.select().from(user).where(eq(user.id, userId));
      return result[0] || null;
    } catch (error) {
      console.error(`Failed to get user ${userId}:`, error);
      throw error;
    }
  });
}

export async function updateUser(
  userId: string,
  data: Partial<Omit<User, "id">>
) {
  validateUserId(userId);

  if (!data || Object.keys(data).length === 0) {
    throw new DatabaseError("Update data is required");
  }

  // Validate update data
  if (data.email) {
    validateEmail(data.email);
    data.email = data.email.toLowerCase().trim();
  }

  if (
    data.name &&
    (typeof data.name !== "string" || data.name.trim().length === 0)
  ) {
    throw new DatabaseError("User name cannot be empty");
  }

  if (data.name && data.name.length > 100) {
    throw new DatabaseError("User name is too long (maximum 100 characters)");
  }

  if (
    data.password &&
    (typeof data.password !== "string" || data.password.length < 6)
  ) {
    throw new DatabaseError("Password must be at least 6 characters long");
  }

  return await withDatabaseConnection(async () => {
    try {
      // Verify user exists
      const userExists = await getUserById(userId);
      if (!userExists) {
        throw new DatabaseError("User not found");
      }

      // Check for email conflicts if updating email
      if (data.email && data.email !== userExists.email) {
        const emailExists = await getUserByEmail(data.email);
        if (emailExists) {
          throw new DatabaseError("Email already in use by another user");
        }
      }

      const result = await db
        .update(user)
        .set(data)
        .where(eq(user.id, userId))
        .returning();

      return result[0] || null;
    } catch (error) {
      console.error(`Failed to update user ${userId}:`, error);
      throw error;
    }
  });
}

export async function forgotPassword(email: string, newPassword: string) {
  validateEmail(email);

  if (
    !newPassword ||
    typeof newPassword !== "string" ||
    newPassword.length < 6
  ) {
    throw new DatabaseError("New password must be at least 6 characters long");
  }

  return await withDatabaseConnection(async () => {
    try {
      // Verify user exists
      const userExists = await getUserByEmail(email);
      if (!userExists) {
        throw new DatabaseError("User not found");
      }

      const result = await db
        .update(user)
        .set({ password: newPassword })
        .where(eq(user.email, email.toLowerCase().trim()))
        .returning();

      return result[0] || null;
    } catch (error) {
      console.error(`Failed to reset password for ${email}:`, error);
      throw error;
    }
  });
}

export async function deleteUser(userId: string) {
  validateUserId(userId);

  return await withDatabaseConnection(async () => {
    try {
      // First delete user's chats and messages
      const userChats = await getChatsByUserId(userId);
      for (const chat of userChats) {
        await deleteChat(chat.id);
      }

      // Then delete the user
      const result = await db
        .delete(user)
        .where(eq(user.id, userId))
        .returning();

      return result.length > 0;
    } catch (error) {
      console.error(`Failed to delete user ${userId}:`, error);
      throw error;
    }
  });
}
