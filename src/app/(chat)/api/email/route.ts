import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  sendEmail,
  verifyConnection,
  emailTemplates,
  EmailData,
} from "@/lib/email";
import { EmailRequestSchema } from "./schema";
import {
  emailRateLimit,
  RateLimitError,
  addRateLimitHeaders,
} from "@/lib/rate-limit";

// Email validation and sanitization helpers
function sanitizeEmailContent(content: string): string {
  return content
    .trim()
    .slice(0, 10000)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/data:text\/html/gi, "");
}

function validateEmailAddress(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

function validateEmailAddresses(emails: string | string[]): boolean {
  const emailArray = Array.isArray(emails) ? emails : [emails];
  return emailArray.every((email) => validateEmailAddress(email));
}

// POST endpoint to send email or verify connection
export async function POST(request: NextRequest) {
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
          success: false,
          error: "Invalid JSON in request body",
          message: "Please check your request format",
        },
        { status: 400 }
      );
    }

    if (body.action === "verify") {
      try {
        const result = await verifyConnection();

        return NextResponse.json(
          {
            success: result.success,
            message: result.message,
            error: result.error,
            timestamp: new Date().toISOString(),
          },
          { status: result.success ? 200 : 503 }
        );
      } catch (error) {
        console.error("Email connection verification error:", {
          error: error instanceof Error ? error.message : "Unknown error",
          clientIP,
          timestamp: new Date().toISOString(),
        });

        return NextResponse.json(
          {
            success: false,
            error: "Connection verification failed",
            message: "Unable to verify email service connection",
            timestamp: new Date().toISOString(),
          },
          { status: 503 }
        );
      }
    }

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
            success: false,
            error: "Email rate limit exceeded",
            message: "Please wait before sending another email",
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

    let validatedData;
    try {
      validatedData = EmailRequestSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid request data",
            message: "Please check your email request format",
            details: error.issues.map((issue) => ({
              field: issue.path.join("."),
              message: issue.message,
            })),
          },
          { status: 400 }
        );
      }
      throw error;
    }

    if (!validateEmailAddresses(validatedData.to)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid email address",
          message: "Please provide valid recipient email address(es)",
        },
        { status: 400 }
      );
    }

    let emailData: EmailData;

    if (validatedData.template && validatedData.templateData) {
      const { name, appName, resetLink, message } = validatedData.templateData;

      const sanitizedName = name ? sanitizeEmailContent(name) : "";
      const sanitizedAppName = appName
        ? sanitizeEmailContent(appName)
        : "Chat App";
      const sanitizedMessage = message ? sanitizeEmailContent(message) : "";

      let templateResult;
      switch (validatedData.template) {
        case "welcome":
          if (!sanitizedName) {
            return NextResponse.json(
              {
                success: false,
                error: "Invalid template data",
                message: "Name is required for welcome template",
              },
              { status: 400 }
            );
          }
          templateResult = emailTemplates.welcome(
            sanitizedName,
            sanitizedAppName
          );
          break;

        case "passwordReset":
          if (!resetLink || !sanitizedName) {
            return NextResponse.json(
              {
                success: false,
                error: "Invalid template data",
                message:
                  "Reset link and name are required for password reset template",
              },
              { status: 400 }
            );
          }

          try {
            new URL(resetLink);
          } catch {
            return NextResponse.json(
              {
                success: false,
                error: "Invalid reset link",
                message: "Reset link must be a valid URL",
              },
              { status: 400 }
            );
          }

          templateResult = emailTemplates.passwordReset(
            sanitizedName,
            resetLink,
            sanitizedAppName
          );
          break;

        case "notification":
          if (!sanitizedMessage || !sanitizedName) {
            return NextResponse.json(
              {
                success: false,
                error: "Invalid template data",
                message:
                  "Message and name are required for notification template",
              },
              { status: 400 }
            );
          }
          templateResult = emailTemplates.notification(
            sanitizedName,
            sanitizedMessage,
            sanitizedAppName
          );
          break;

        default:
          return NextResponse.json(
            {
              success: false,
              error: "Invalid template type",
              message:
                "Supported templates: welcome, passwordReset, notification",
            },
            { status: 400 }
          );
      }

      emailData = {
        to: validatedData.to,
        subject: templateResult.subject,
        text: templateResult.text,
        html: templateResult.html,
        from: validatedData.from,
      };
    } else {
      if (!validatedData.text && !validatedData.html) {
        return NextResponse.json(
          {
            success: false,
            error: "Missing email content",
            message: "Either text or html content is required",
          },
          { status: 400 }
        );
      }

      if (!validatedData.subject || validatedData.subject.trim().length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Missing subject",
            message: "Email subject is required",
          },
          { status: 400 }
        );
      }

      emailData = {
        to: validatedData.to,
        subject: sanitizeEmailContent(validatedData.subject),
        text: validatedData.text
          ? sanitizeEmailContent(validatedData.text)
          : undefined,
        html: validatedData.html
          ? sanitizeEmailContent(validatedData.html)
          : undefined,
        from: validatedData.from,
      };
    }

    let result;
    try {
      result = await sendEmail(emailData);
    } catch (error) {
      console.error("Email sending error:", {
        error: error instanceof Error ? error.message : "Unknown error",
        recipient: emailData.to,
        clientIP,
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json(
        {
          success: false,
          error: "Email delivery failed",
          message:
            "Unable to send email. Please check your configuration and try again.",
        },
        { status: 503 }
      );
    }

    if (result.success) {
      console.log(
        `Email sent successfully to ${emailData.to} from IP: ${clientIP}`
      );

      return NextResponse.json({
        success: true,
        messageId: result.messageId,
        response: result.response,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.error("Email delivery failed:", {
        error: result.error,
        recipient: emailData.to,
        clientIP,
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json(
        {
          success: false,
          error: "Email delivery failed",
          message: result.error || "Unable to send email",
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Email API error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      clientIP,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        message:
          "An unexpected error occurred while processing your email request",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// GET endpoint for testing connection
export async function GET(request: NextRequest) {
  const clientIP =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";

  try {
    const result = await verifyConnection();

    console.log(
      `Email connection test from IP: ${clientIP}, Result: ${result.success}`
    );

    return NextResponse.json(
      {
        success: result.success,
        message: result.message,
        error: result.error,
        timestamp: new Date().toISOString(),
      },
      { status: result.success ? 200 : 503 }
    );
  } catch (error) {
    console.error("Email connection test error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      clientIP,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        success: false,
        error: "Connection test failed",
        message: "Failed to test email connection",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
