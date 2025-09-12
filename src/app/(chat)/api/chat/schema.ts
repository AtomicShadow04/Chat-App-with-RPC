import { id } from "date-fns/locale";
import { z } from "zod";

const textPartSchema = z.object({
	type: z.literal("text"),
	text: z.string().min(1),
});

const filePartSchema = z.object({
	type: z.literal("file"),
	mime: z.enum(["image/png", "image/jpeg", "image/gif", "application/pdf"]),
	url: z.string().url(),
	name: z.string().min(1),
});

const partSchema = z.discriminatedUnion("type", [
	textPartSchema,
	filePartSchema,
]);

export const postRequestBodySchema = z.object({
	id: z.string().uuid(),
	message: z.object({
		id: z.string().uuid(),
		role: z.enum(["user", "assistant"]),
		parts: z.array(partSchema),
	}),
});
