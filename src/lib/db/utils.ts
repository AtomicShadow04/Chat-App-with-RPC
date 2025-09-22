import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, PoolClient } from "pg";

// Enhanced pool configuration with error handling
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Add pool error handling
pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
});

pool.on("connect", () => {
  console.log("Database pool connected");
});

export const db = drizzle(pool);

// Database error types
export class DatabaseError extends Error {
  constructor(
    message: string,
    public code?: string,
    public detail?: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = "DatabaseError";
  }
}

// Database connection helper with retry logic
export async function withDatabaseConnection<T>(
  operation: (client?: PoolClient) => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.error(
        `Database operation failed (attempt ${attempt}/${maxRetries}):`,
        error
      );

      // Check if error is retryable
      if (isRetryableError(error) && attempt < maxRetries) {
        // Wait before retry with exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
        continue;
      }

      // Transform database errors into our custom error type
      throw transformDatabaseError(error);
    }
  }

  throw transformDatabaseError(lastError!);
}

// Check if database error is retryable
function isRetryableError(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error) {
    const pgError = error as { code: string };
    // PostgreSQL error codes that are typically retryable
    const retryableCodes = [
      "08000", // Connection exception
      "08003", // Connection does not exist
      "08006", // Connection failure
      "53300", // Too many connections
      "57P01", // Admin shutdown
      "57P02", // Crash shutdown
      "57P03", // Cannot connect now
    ];
    return retryableCodes.includes(pgError.code);
  }
  return false;
}

// Transform database errors into consistent format
function transformDatabaseError(error: unknown): DatabaseError {
  if (error && typeof error === "object") {
    const pgError = error as {
      code?: string;
      detail?: string;
      message?: string;
    };

    // Handle specific PostgreSQL error codes
    switch (pgError.code) {
      case "23505": // unique_violation
        return new DatabaseError(
          "A record with this information already exists",
          pgError.code,
          pgError.detail,
          error as Error
        );
      case "23503": // foreign_key_violation
        return new DatabaseError(
          "Referenced record does not exist",
          pgError.code,
          pgError.detail,
          error as Error
        );
      case "23502": // not_null_violation
        return new DatabaseError(
          "Required field is missing",
          pgError.code,
          pgError.detail,
          error as Error
        );
      case "23514": // check_violation
        return new DatabaseError(
          "Invalid data provided",
          pgError.code,
          pgError.detail,
          error as Error
        );
      case "42P01": // undefined_table
        return new DatabaseError(
          "Database table not found",
          pgError.code,
          pgError.detail,
          error as Error
        );
      case "42703": // undefined_column
        return new DatabaseError(
          "Database column not found",
          pgError.code,
          pgError.detail,
          error as Error
        );
      default:
        return new DatabaseError(
          pgError.message || "Database operation failed",
          pgError.code,
          pgError.detail,
          error as Error
        );
    }
  }

  if (error instanceof Error) {
    return new DatabaseError(error.message, undefined, undefined, error);
  }

  return new DatabaseError("Unknown database error occurred");
}

// Graceful shutdown helper
export async function closeDatabaseConnection(): Promise<void> {
  try {
    await pool.end();
    console.log("Database pool closed");
  } catch (error) {
    console.error("Error closing database pool:", error);
  }
}

// Health check function
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  message: string;
}> {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    return { healthy: true, message: "Database connection is healthy" };
  } catch (error) {
    console.error("Database health check failed:", error);
    return { healthy: false, message: "Database connection failed" };
  }
}
