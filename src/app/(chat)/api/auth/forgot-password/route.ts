import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail, forgotPassword } from "@/lib/db/queries";
import { sendEmail, emailTemplates } from "@/lib/email";
import { forgotPasswordRequestSchema, passwordResetSchema } from "../schema";
import { DatabaseError } from "@/lib/db/utils";
import {
  authRateLimit,
  emailRateLimit,
  RateLimitError,
  addRateLimitHeaders,
} from "@/lib/rate-limit";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const clientIP =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";

  try {
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

    if ("token" in body && "newPassword" in body) {
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
              error: "Too many password reset attempts",
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

      const validation = passwordResetSchema.safeParse(body);

      if (!validation.success) {
        return NextResponse.json(
          {
            error: "Invalid request data",
            message: "Please check your password reset information",
            details: validation.error.issues.map((issue) => ({
              field: issue.path.join("."),
              message: issue.message,
            })),
          },
          { status: 400 }
        );
      }

      const { email, token, newPassword } = validation.data;

      if (newPassword.length < 8) {
        return NextResponse.json(
          {
            error: "Password too weak",
            message: "New password must be at least 8 characters long",
          },
          { status: 400 }
        );
      }

      const minResponseTime = 1000;

      try {
        const user = await forgotPassword(email, newPassword);

        if (!user) {
          const elapsed = Date.now() - startTime;
          if (elapsed < minResponseTime) {
            await new Promise((resolve) =>
              setTimeout(resolve, minResponseTime - elapsed)
            );
          }

          return NextResponse.json(
            {
              error: "Invalid or expired reset token",
              message: "The reset link is invalid or has expired",
            },
            { status: 400 }
          );
        }

        console.log(
          `Password reset successful for ${email} from IP: ${clientIP}`
        );

        setImmediate(async () => {
          try {
            const confirmationMessage = `Your password has been successfully reset at ${new Date().toLocaleString()} from IP: ${clientIP}.`;

            await sendEmail({
              to: email,
              ...emailTemplates.notification(
                user.name,
                confirmationMessage,
                "Chat App"
              ),
            });

            console.log(`Password reset confirmation sent to ${email}`);
          } catch (emailError) {
            console.error(
              "Failed to send password reset confirmation:",
              emailError
            );
          }
        });

        const elapsed = Date.now() - startTime;
        if (elapsed < minResponseTime) {
          await new Promise((resolve) =>
            setTimeout(resolve, minResponseTime - elapsed)
          );
        }

        return NextResponse.json({
          success: true,
          message: "Password reset successfully",
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error(`Password reset error for ${email}:`, error);

        if (error instanceof DatabaseError) {
          const elapsed = Date.now() - startTime;
          if (elapsed < minResponseTime) {
            await new Promise((resolve) =>
              setTimeout(resolve, minResponseTime - elapsed)
            );
          }

          return NextResponse.json(
            {
              error: "Password reset failed",
              message:
                "Unable to reset password. Please try again or request a new reset link.",
            },
            { status: 400 }
          );
        }

        throw error;
      }
    } else {
      try {
        await emailRateLimit(request);
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
              error: "Email rate limit exceeded",
              message:
                "Please wait before requesting another password reset email",
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

      const validation = forgotPasswordRequestSchema.safeParse(body);

      if (!validation.success) {
        return NextResponse.json(
          {
            error: "Invalid request data",
            message: "Please provide a valid email address",
            details: validation.error.issues.map((issue) => ({
              field: issue.path.join("."),
              message: issue.message,
            })),
          },
          { status: 400 }
        );
      }

      const { email } = validation.data;
      const minResponseTime = 2000;

      try {
        const user = await getUserByEmail(email);

        const securityMessage =
          "If an account with this email exists, a password reset link has been sent.";

        if (!user) {
          const elapsed = Date.now() - startTime;
          if (elapsed < minResponseTime) {
            await new Promise((resolve) =>
              setTimeout(resolve, minResponseTime - elapsed)
            );
          }

          return NextResponse.json({
            success: true,
            message: securityMessage,
            timestamp: new Date().toISOString(),
          });
        }

        const resetToken = crypto.randomBytes(32).toString("hex");
        const tokenExpiry = Date.now() + 60 * 60 * 1000;
        const resetLink = `${
          process.env.NEXTAUTH_URL || "http://localhost:3000"
        }/reset-password?token=${resetToken}&email=${encodeURIComponent(
          email
        )}`;

        setImmediate(async () => {
          try {
            await sendEmail({
              to: email,
              ...emailTemplates.passwordReset(user.name, resetLink, "Chat App"),
            });

            console.log(
              `Password reset email sent to ${email} from IP: ${clientIP}`
            );
          } catch (emailError) {
            console.error("Failed to send password reset email:", emailError);
          }
        });

        const elapsed = Date.now() - startTime;
        if (elapsed < minResponseTime) {
          await new Promise((resolve) =>
            setTimeout(resolve, minResponseTime - elapsed)
          );
        }

        return NextResponse.json({
          success: true,
          message: "Password reset link has been sent to your email address.",
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error(`Forgot password error for ${email}:`, error);

        if (error instanceof DatabaseError) {
          const elapsed = Date.now() - startTime;
          if (elapsed < minResponseTime) {
            await new Promise((resolve) =>
              setTimeout(resolve, minResponseTime - elapsed)
            );
          }

          return NextResponse.json({
            success: true,
            message:
              "If an account with this email exists, a password reset link has been sent.",
            timestamp: new Date().toISOString(),
          });
        }

        throw error;
      }
    }
  } catch (error) {
    console.error("Forgot password error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      clientIP,
      timestamp: new Date().toISOString(),
    });

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
