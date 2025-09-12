import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { ChatSDKError, ErrorCode } from "./error";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export const fetcher = async (url: string) => {
	const response = await fetch(url);
	if (!response.ok) {
		const { code, message, cause } = await response.json();
		throw new ChatSDKError(code as ErrorCode, cause);
	}
	return response.json();
};
