import { NextRequest } from "next/server";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  keyGenerator?: (request: NextRequest) => string;
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach((key) => {
    if (store[key].resetTime <= now) {
      delete store[key];
    }
  });
}, 10 * 60 * 1000);

export class RateLimitError extends Error {
  constructor(
    message: string,
    public retryAfter: number,
    public limit: number,
    public remaining: number
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

const defaultKeyGenerator = (request: NextRequest): string => {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIP = request.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0]?.trim() || realIP || "unknown";
  return `rate_limit:${ip}`;
};

export function rateLimit(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    message,
    standardHeaders = true,
    legacyHeaders = false,
    keyGenerator = defaultKeyGenerator,
  } = options;

  return async (request: NextRequest): Promise<void> => {
    const key = keyGenerator(request);
    const now = Date.now();
    const resetTime = now + windowMs;

    let rateLimitData = store[key];

    if (!rateLimitData || rateLimitData.resetTime <= now) {
      rateLimitData = {
        count: 0,
        resetTime,
      };
      store[key] = rateLimitData;
    }

    rateLimitData.count++;

    const remaining = Math.max(0, max - rateLimitData.count);
    const retryAfter = Math.ceil((rateLimitData.resetTime - now) / 1000);

    if (rateLimitData.count > max) {
      throw new RateLimitError(message, retryAfter, max, 0);
    }
  };
}

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many authentication attempts. Please try again later.",
});

export const emailRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 2,
  message:
    "Email rate limit exceeded. Please wait before sending another email.",
});

export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: "API rate limit exceeded. Please slow down your requests.",
});

export const chatRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message:
    "Too many chat messages. Please wait before sending another message.",
});

export function getRateLimitInfo(key: string, windowMs: number, max: number) {
  const now = Date.now();
  const rateLimitData = store[key];

  if (!rateLimitData || rateLimitData.resetTime <= now) {
    return {
      limit: max,
      remaining: max,
      resetTime: now + windowMs,
      retryAfter: 0,
    };
  }

  const remaining = Math.max(0, max - rateLimitData.count);
  const retryAfter = Math.ceil((rateLimitData.resetTime - now) / 1000);

  return {
    limit: max,
    remaining,
    resetTime: rateLimitData.resetTime,
    retryAfter: remaining === 0 ? retryAfter : 0,
  };
}

export function addRateLimitHeaders(
  headers: Headers,
  limit: number,
  remaining: number,
  resetTime: number,
  retryAfter?: number
) {
  headers.set("X-RateLimit-Limit", limit.toString());
  headers.set("X-RateLimit-Remaining", remaining.toString());
  headers.set("X-RateLimit-Reset", Math.ceil(resetTime / 1000).toString());

  if (retryAfter) {
    headers.set("Retry-After", retryAfter.toString());
  }

  return headers;
}

export function createIPRateLimit(
  options: RateLimitOptions & {
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
  }
) {
  const baseRateLimit = rateLimit(options);

  return async (
    request: NextRequest,
    wasSuccessful?: boolean
  ): Promise<void> => {
    if (options.skipSuccessfulRequests && wasSuccessful) {
      return;
    }

    if (options.skipFailedRequests && wasSuccessful === false) {
      return;
    }

    return baseRateLimit(request);
  };
}

export function createTieredRateLimit(
  tiers: Array<{
    windowMs: number;
    max: number;
    message: string;
  }>
) {
  const rateLimiters = tiers.map((tier) => rateLimit(tier));

  return async (request: NextRequest): Promise<void> => {
    const errors: RateLimitError[] = [];

    for (const rateLimit of rateLimiters) {
      try {
        await rateLimit(request);
      } catch (error) {
        if (error instanceof RateLimitError) {
          errors.push(error);
        }
      }
    }

    if (errors.length > 0) {
      const mostRestrictive = errors.reduce((prev, curr) =>
        curr.retryAfter > prev.retryAfter ? curr : prev
      );
      throw mostRestrictive;
    }
  };
}
