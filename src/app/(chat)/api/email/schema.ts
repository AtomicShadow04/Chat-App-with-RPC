import { z } from "zod";

export const EmailRequestSchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email())]),
  subject: z.string().min(1),
  text: z.string().optional(),
  html: z.string().optional(),
  from: z.string().email().optional(),
  template: z.enum(["welcome", "passwordReset", "notification"]).optional(),
  templateData: z
    .object({
      name: z.string(),
      appName: z.string().optional(),
      resetLink: z.string().url().optional(),
      message: z.string().optional(),
    })
    .optional(),
});

export const VerifyConnectionSchema = z.object({
  action: z.literal("verify"),
});

export type EmailRequest = z.infer<typeof EmailRequestSchema>;
export type VerifyRequest = z.infer<typeof VerifyConnectionSchema>;
