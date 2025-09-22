import { NextRequest, NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { postRequestBodySchema, updateChatTitleSchema } from "./schema";
import {
  getChatsByUserId,
  getChatById,
  createChat,
  getMessagesByChatId,
  createMessage,
  deleteChat,
  updateChatTitle,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/error";
import { DatabaseError } from "@/lib/db/utils";
import {
  chatRateLimit,
  RateLimitError,
  addRateLimitHeaders,
} from "@/lib/rate-limit";

// Hardcoded userId for demo; replace with actual auth
const USER_ID = "user_123";

// AI API error handling class
class AIAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public retryable: boolean = true
  ) {
    super(message);
    this.name = "AIAPIError";
  }
}

// Helper function to sanitize user input
function sanitizeUserInput(input: string): string {
  // Remove potential harmful content
  return input
    .trim()
    .slice(0, 4000) // Limit length
    .replace(/[<>]/g, "") // Remove potential HTML tags
    .replace(/javascript:/gi, "") // Remove javascript: protocol
    .replace(/data:/gi, ""); // Remove data: protocol
}

// Helper function to handle AI API calls with retry logic
async function generateAIResponse(
  userMessage: string,
  maxRetries: number = 3
): Promise<string> {
  const sanitizedMessage = sanitizeUserInput(userMessage);

  if (!sanitizedMessage) {
    throw new AIAPIError("Invalid or empty message provided", 400, false);
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await generateText({
        model: openai("gpt-4o-mini"),
        prompt: `You are a helpful AI assistant. Respond to: ${sanitizedMessage}`,
        temperature: 0.7,
      });

      if (!result.text || result.text.trim().length === 0) {
        throw new AIAPIError("Empty response from AI service", 502, true);
      }

      return result.text.trim();
    } catch (error) {
      console.error(`AI API error (attempt ${attempt}/${maxRetries}):`, error);

      if (error instanceof Error) {
        // Handle specific AI SDK errors
        if (error.message.includes("rate limit")) {
          throw new AIAPIError(
            "AI service rate limit exceeded. Please try again later.",
            429,
            true
          );
        }

        if (
          error.message.includes("insufficient credits") ||
          error.message.includes("quota")
        ) {
          throw new AIAPIError(
            "AI service quota exceeded. Please try again later.",
            503,
            false
          );
        }

        if (error.message.includes("model not found")) {
          throw new AIAPIError("AI model temporarily unavailable.", 503, false);
        }

        if (error.message.includes("timeout")) {
          throw new AIAPIError("AI service timeout.", 504, true);
        }
      }

      // If this isn't the last attempt and error is retryable, wait before retry
      if (attempt < maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
        continue;
      }

      // Final attempt failed
      if (error instanceof AIAPIError) {
        throw error;
      }

      throw new AIAPIError(
        "AI service temporarily unavailable. Please try again later.",
        503,
        true
      );
    }
  }

  throw new AIAPIError("AI service failed after multiple attempts.", 503, true);
}

export async function GET(request: NextRequest) {
  const clientIP =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";

  try {
    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get("id");

    if (!chatId || typeof chatId !== "string" || chatId.trim().length === 0) {
      return NextResponse.json(
        {
          error: "Chat ID required",
          message: "Please provide a valid chat ID",
        },
        { status: 400 }
      );
    }

    try {
      const [messages, chats] = await Promise.all([
        getMessagesByChatId(chatId),
        getChatsByUserId(USER_ID),
      ]);

      return NextResponse.json({
        messages,
        chats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(
        `GET chat error for chatId ${chatId} from IP: ${clientIP}:`,
        error
      );

      if (error instanceof DatabaseError) {
        return NextResponse.json(
          {
            error: "Database error",
            message: "Unable to retrieve chat data. Please try again.",
          },
          { status: 503 }
        );
      }

      throw error;
    }
  } catch (error) {
    console.error("GET chat error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      clientIP,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        error: "Internal server error",
        message: "An unexpected error occurred while retrieving chat data.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const clientIP =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";

  try {
    // Apply rate limiting for chat messages
    try {
      await chatRateLimit(request);
    } catch (error) {
      if (error instanceof RateLimitError) {
        const headers = new Headers();
        addRateLimitHeaders(
          headers,
          error.limit,
          error.remaining,
          Date.now() + 60 * 1000,
          error.retryAfter
        );

        return NextResponse.json(
          {
            error: "Too many messages",
            message: "Please slow down your message sending",
            retryAfter: error.retryAfter,
          },
          {
            status: 429,
            headers,
          }
        );
      }
      throw error;
    }

    // Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        {
          error: "Invalid JSON in request body",
          message: "Please check your request format",
        },
        { status: 400 }
      );
    }

    const validation = postRequestBodySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          message: "Please check your message format",
          details: validation.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const { id: chatId, message } = validation.data;
    const userMessageText =
      message.parts.find((p) => p.type === "text")?.text || "";

    // Validate message content
    if (!userMessageText || userMessageText.trim().length === 0) {
      return NextResponse.json(
        {
          error: "Empty message",
          message: "Please provide a message to send",
        },
        { status: 400 }
      );
    }

    if (userMessageText.length > 4000) {
      return NextResponse.json(
        {
          error: "Message too long",
          message: "Message must be less than 4000 characters",
        },
        { status: 400 }
      );
    }

    try {
      // Get or create chat
      let chat;
      if (chatId) {
        chat = await getChatById(chatId);
      }

      if (!chat) {
        // Generate a better title from the first message
        const title =
          userMessageText.length > 50
            ? userMessageText.slice(0, 47) + "..."
            : userMessageText || "New Chat";
        chat = await createChat(USER_ID, title);
      }

      // Create user message
      await createMessage(chat.id, userMessageText, "user");

      // Generate AI response with error handling
      let botResponse: string;
      try {
        botResponse = await generateAIResponse(userMessageText);
      } catch (error) {
        console.error(
          `AI API error for chat ${chat.id} from IP: ${clientIP}:`,
          error
        );

        if (error instanceof AIAPIError) {
          // Create error message in chat
          const errorMessage = `I apologize, but I'm experiencing technical difficulties. ${error.message}`;
          const botMessage = await createMessage(chat.id, errorMessage, "bot");

          return NextResponse.json(botMessage, { status: error.statusCode });
        }

        // Generic AI error
        const errorMessage =
          "I apologize, but I'm temporarily unable to respond. Please try again in a moment.";
        const botMessage = await createMessage(chat.id, errorMessage, "bot");

        return NextResponse.json(botMessage, { status: 503 });
      }

      // Create bot message
      const botMessage = await createMessage(chat.id, botResponse, "bot");

      console.log(
        `Chat message processed successfully for chat ${chat.id} from IP: ${clientIP}`
      );

      return NextResponse.json({
        ...botMessage,
        chatId: chat.id,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(
        `Database error in chat POST for user ${USER_ID} from IP: ${clientIP}:`,
        error
      );

      if (error instanceof DatabaseError) {
        return NextResponse.json(
          {
            error: "Database error",
            message: "Unable to save your message. Please try again.",
          },
          { status: 503 }
        );
      }

      throw error;
    }
  } catch (error) {
    console.error("POST chat error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      clientIP,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        error: "Internal server error",
        message: "An unexpected error occurred while processing your message.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const clientIP =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";

  try {
    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get("id");

    if (!chatId || typeof chatId !== "string" || chatId.trim().length === 0) {
      return NextResponse.json(
        {
          error: "Chat ID required",
          message: "Please provide a valid chat ID to delete",
        },
        { status: 400 }
      );
    }

    try {
      // Check if chat exists before deletion
      const chat = await getChatById(chatId);
      if (!chat) {
        return NextResponse.json(
          {
            error: "Chat not found",
            message: "The chat you're trying to delete doesn't exist",
          },
          { status: 404 }
        );
      }

      // Verify ownership (in production, check if user owns this chat)
      if (chat.userId !== USER_ID) {
        return NextResponse.json(
          {
            error: "Unauthorized",
            message: "You don't have permission to delete this chat",
          },
          { status: 403 }
        );
      }

      const deleted = await deleteChat(chatId);
      if (!deleted) {
        return NextResponse.json(
          {
            error: "Deletion failed",
            message: "Unable to delete chat. Please try again.",
          },
          { status: 500 }
        );
      }

      console.log(
        `Chat ${chatId} deleted successfully by user ${USER_ID} from IP: ${clientIP}`
      );

      return NextResponse.json({
        success: true,
        message: "Chat deleted successfully",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(
        `Database error in chat DELETE for chatId ${chatId} from IP: ${clientIP}:`,
        error
      );

      if (error instanceof DatabaseError) {
        return NextResponse.json(
          {
            error: "Database error",
            message: "Unable to delete chat. Please try again.",
          },
          { status: 503 }
        );
      }

      throw error;
    }
  } catch (error) {
    console.error("DELETE chat error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      clientIP,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        error: "Internal server error",
        message: "An unexpected error occurred while deleting the chat.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const clientIP =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";

  try {
    // Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        {
          error: "Invalid JSON in request body",
          message: "Please check your request format",
        },
        { status: 400 }
      );
    }

    const validation = updateChatTitleSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid request data",
          message: "Please check your chat update information",
          details: validation.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const { chatId, title } = validation.data;

    try {
      // Check if chat exists and user has permission
      const chat = await getChatById(chatId);
      if (!chat) {
        return NextResponse.json(
          {
            error: "Chat not found",
            message: "The chat you're trying to update doesn't exist",
          },
          { status: 404 }
        );
      }

      // Verify ownership
      if (chat.userId !== USER_ID) {
        return NextResponse.json(
          {
            error: "Unauthorized",
            message: "You don't have permission to update this chat",
          },
          { status: 403 }
        );
      }

      const updated = await updateChatTitle(chatId, title);
      if (!updated) {
        return NextResponse.json(
          {
            error: "Update failed",
            message: "Unable to update chat title. Please try again.",
          },
          { status: 500 }
        );
      }

      console.log(
        `Chat title updated for ${chatId} by user ${USER_ID} from IP: ${clientIP}`
      );

      return NextResponse.json({
        success: true,
        message: "Chat title updated successfully",
        chat: updated,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(
        `Database error in chat PUT for chatId ${chatId} from IP: ${clientIP}:`,
        error
      );

      if (error instanceof DatabaseError) {
        return NextResponse.json(
          {
            error: "Database error",
            message: "Unable to update chat. Please try again.",
          },
          { status: 503 }
        );
      }

      throw error;
    }
  } catch (error) {
    console.error("PUT chat error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      clientIP,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        error: "Internal server error",
        message: "An unexpected error occurred while updating the chat.",
      },
      { status: 500 }
    );
  }
}
