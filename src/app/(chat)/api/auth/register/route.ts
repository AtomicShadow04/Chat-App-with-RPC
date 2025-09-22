import { NextRequest, NextResponse } from "next/server";
import { createUser } from "@/lib/db/queries";
import { sendEmail, emailTemplates } from "@/lib/email";
import { registerSchema } from "../schema";
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
            error: "Too many registration attempts",
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

    const validation = registerSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid request data",
          message: "Please check your registration information",
          details: validation.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const { email, name, password } = validation.data;

    if (password.length < 8) {
      return NextResponse.json(
        {
          error: "Password too weak",
          message: "Password must be at least 8 characters long",
        },
        { status: 400 }
      );
    }

    const commonPasswords = ["password", "12345678", "password123", "admin123"];
    if (commonPasswords.includes(password.toLowerCase())) {
      return NextResponse.json(
        {
          error: "Password too weak",
          message: "Please choose a stronger password",
        },
        { status: 400 }
      );
    }

    const minResponseTime = 1000;

    try {
      const user = await createUser(email, password, name);

      setImmediate(async () => {
        try {
          await sendEmail({
            to: email,
            ...emailTemplates.welcome(name, "Chat App"),
          });

          console.log(`Welcome email sent to ${email}`);
        } catch (emailError) {
          console.error("Failed to send welcome email:", emailError);
        }
      });

      console.log(`New user registered: ${email} from IP: ${clientIP}`);

      const { password: _, createdAt, ...userWithoutSensitiveData } = user;

      const elapsed = Date.now() - startTime;
      if (elapsed < minResponseTime) {
        await new Promise((resolve) =>
          setTimeout(resolve, minResponseTime - elapsed)
        );
      }

      return NextResponse.json({
        success: true,
        message: "User registered successfully",
        user: userWithoutSensitiveData,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`Registration error for ${email}:`, error);

      if (error instanceof DatabaseError) {
        if (error.message.includes("already exists")) {
          const elapsed = Date.now() - startTime;
          if (elapsed < minResponseTime) {
            await new Promise((resolve) =>
              setTimeout(resolve, minResponseTime - elapsed)
            );
          }

          return NextResponse.json(
            {
              error: "Email already registered",
              message: "An account with this email already exists",
            },
            { status: 409 }
          );
        }

        const elapsed = Date.now() - startTime;
        if (elapsed < minResponseTime) {
          await new Promise((resolve) =>
            setTimeout(resolve, minResponseTime - elapsed)
          );
        }

        return NextResponse.json(
          {
            error: "Registration failed",
            message:
              error.message ||
              "Unable to create account. Please try again later.",
          },
          { status: 400 }
        );
      }

      throw error;
    }
  } catch (error) {
    console.error("Registration error:", {
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
        message:
          "An unexpected error occurred during registration. Please try again later.",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
