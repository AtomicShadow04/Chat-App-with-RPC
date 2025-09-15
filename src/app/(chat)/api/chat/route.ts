import { NextRequest, NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { postRequestBodySchema } from "./schema";
import {
  getChatsByUserId,
  getChatById,
  createChat,
  getMessagesByChatId,
  createMessage,
  deleteChat,
} from "@/lib/db/queries";

// Hardcoded userId for demo; replace with actual auth
const USER_ID = "user_123";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get("id");

    if (chatId) {
      const messages = await getMessagesByChatId(chatId);
      const chats = await getChatsByUserId(USER_ID);
      return NextResponse.json({ messages, chats });
    } else {
      return NextResponse.json({ error: "Chat ID required" }, { status: 400 });
    }
  } catch (error) {
    console.error("GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = postRequestBodySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { id: chatId, message } = validation.data;
    const userMessageText =
      message.parts.find((p) => p.type === "text")?.text || "";

    let chat = await getChatById(chatId);
    if (!chat) {
      chat = await createChat(USER_ID, "New Chat");
    }

    await createMessage(chat.id, userMessageText, "user");

    const { text: botResponse } = await generateText({
      model: openai("gpt-4o-mini"),
      prompt: `You are AI so respond to: ${userMessageText}`,
    });

    const botMessage = await createMessage(chat.id, botResponse, "bot");

    return NextResponse.json(botMessage);
  } catch (error) {
    console.error("POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get("id");

    if (!chatId) {
      return NextResponse.json({ error: "Chat ID required" }, { status: 400 });
    }

    await deleteChat(chatId);
    return NextResponse.json({ message: "Chat deleted" });
  } catch (error) {
    console.error("DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
