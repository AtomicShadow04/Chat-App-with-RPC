export type ErrorType =
	| "bad_request"
	| "unauthorized"
	| "forbidden"
	| "not_found"
	| "rate_limit"
	| "offline";

export type Surface = "chat" | "stream";

export type ErrorVisibility = "log" | "response" | "terminal" | "none";

export const visibilityBySurface: Record<Surface, ErrorVisibility[]> = {
	chat: ["log", "response"],
	stream: ["log", "terminal"],
};

// Status codes and ErrorType mapping
const statusCodeMap: Record<ErrorType, number> = {
	bad_request: 400,
	unauthorized: 401,
	forbidden: 403,
	not_found: 404,
	rate_limit: 429,
	offline: 503,
};

export type ErrorCode = `${ErrorType}:${Surface}`;

export class ChatSDKError extends Error {
	public type: ErrorType;
	public surface: Surface;
	public statusCode: number;

	constructor(errorCode: ErrorCode, cause?: string) {
		super();
		const [type, surface] = errorCode.split(":") as [ErrorType, Surface];
		this.type = type as ErrorType;
		this.surface = surface;
		this.statusCode = statusCodeMap[this.type] || 500;
	}
	public toResponse() {
		const code: ErrorCode = `${this.type}:${this.surface}`;
		const visibilitys = visibilityBySurface[this.surface];

		const { message, cause, statusCode } = this;
		if (visibilitys.includes("response")) {
			return Response.json({ code, message, cause }, { status: statusCode });
		}
		if (visibilitys.includes("log")) {
			console.error({ code, message, cause });
			return Response.json({ code, message }, { status: statusCode });
		}
        if (visibilitys.includes("terminal")) {
            console.debug({ code, message, cause });
            return Response.json({ code, message }, { status: statusCode });
        }
	}
}
export const getMessageFromErrorCode = (error: ErrorCode) => {
	if (error.includes("database")) {
		return "A database error occurred. Please try again later.";
	}
	switch (error) {
		case "bad_request:chat":
			return "Bad request in chat";
		case "bad_request:stream":
			return "Bad request in stream";
		case "unauthorized:chat":
			return "Unauthorized access in chat";
		case "unauthorized:stream":
			return "Unauthorized access in stream";
		case "forbidden:chat":
			return "Forbidden action in chat";
		case "forbidden:stream":
			return "Forbidden action in stream";
		case "not_found:chat":
			return "Chat not found";
		case "not_found:stream":
			return "Stream not found";
		case "rate_limit:chat":
			return "Rate limit exceeded in chat";
		case "rate_limit:stream":
			return "Rate limit exceeded in stream";
		case "offline:chat":
			return "Chat is offline";
		case "offline:stream":
			return "Stream is offline";
		default:
			return "Unknown error";
	}
};
