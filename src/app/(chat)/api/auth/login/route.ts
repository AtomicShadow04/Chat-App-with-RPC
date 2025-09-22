import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/db/queries";
import { sendEmail, emailTemplates } from "@/lib/email";
import { loginSchema } from "../schema";
import { DatabaseError } from "@/lib/db/utils";
import {
  authRateLimit,
  RateLimitError,
  addRateLimitHeaders,
} from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const clientIP =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";

  try {
    try {
      await authRateLimit(request);
    } catch (error) {
      if (error instanceof RateLimitError) {
        const headers = new Headers();
        addRateLimitHeaders(
          headers,
          error.limit,
          error.remaining,
          Date.now() + 15 * 60 * 1000,
          error.retryAfter
        );

        return NextResponse.json(
          {
            error: "Too many login attempts",
            message: "Please wait before trying again",
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

    const validation = loginSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid request data",
          message: "Please check your email and password format",
          details: validation.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const { email, password } = validation.data;

    const minResponseTime = 1000;
    let user;
    try {
      user = await getUserByEmail(email);
    } catch (error) {
      console.error(`Database error during login for ${email}:`, error);

      if (error instanceof DatabaseError) {
        const elapsed = Date.now() - startTime;
        if (elapsed < minResponseTime) {
          await new Promise((resolve) =>
            setTimeout(resolve, minResponseTime - elapsed)
          );
        }

        return NextResponse.json(
          {
            error: "Service temporarily unavailable",
            message: "Please try again in a few moments",
          },
          { status: 503 }
        );
      }
      throw error;
    }

    if (!user) {
      const elapsed = Date.now() - startTime;
      if (elapsed < minResponseTime) {
        await new Promise((resolve) =>
          setTimeout(resolve, minResponseTime - elapsed)
        );
      }

      return NextResponse.json(
        {
          error: "Invalid credentials",
          message: "Email or password is incorrect",
        },
        { status: 401 }
      );
    }

    if (user.password !== password) {
      const elapsed = Date.now() - startTime;
      if (elapsed < minResponseTime) {
        await new Promise((resolve) =>
          setTimeout(resolve, minResponseTime - elapsed)
        );
      }

      console.warn(`Failed login attempt for ${email} from IP: ${clientIP}`);

      return NextResponse.json(
        {
          error: "Invalid credentials",
          message: "Email or password is incorrect",
        },
        { status: 401 }
      );
    }

    setImmediate(async () => {
      try {
        const loginMessage = `You have successfully logged in to your Chat App account at ${new Date().toLocaleString()} from IP: ${clientIP}.`;

        await sendEmail({
          to: email,
          ...emailTemplates.notification(user.name, loginMessage, "Chat App"),
        });

        console.log(`Login notification sent to ${email}`);
      } catch (emailError) {
        console.error("Failed to send login notification email:", emailError);
      }
    });

    console.log(`Successful login for ${email} from IP: ${clientIP}`);

    const { password: _, createdAt, ...userWithoutSensitiveData } = user;

    const elapsed = Date.now() - startTime;
    if (elapsed < minResponseTime) {
      await new Promise((resolve) =>
        setTimeout(resolve, minResponseTime - elapsed)
      );
    }

    return NextResponse.json({
      success: true,
      message: "Login successful",
      user: userWithoutSensitiveData,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Login error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      clientIP,
      timestamp: new Date().toISOString(),
    });

    const elapsed = Date.now() - startTime;
    const minResponseTime = 1000;
    if (elapsed < minResponseTime) {
      await new Promise((resolve) =>
        setTimeout(resolve, minResponseTime - elapsed)
      );
    }

    return NextResponse.json(
      {
        error: "Internal server error",
        message: "An unexpected error occurred. Please try again later.",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
