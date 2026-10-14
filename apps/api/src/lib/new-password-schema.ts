import { z } from "zod";
import { commonPasswordMessage, isCommonPassword } from "./password-policy.js";

export const newPasswordSchema = z.string()
  .min(8, "Use pelo menos 8 caracteres.")
  .max(12, "Use no máximo 12 caracteres.")
  .refine((password) => !isCommonPassword(password), commonPasswordMessage);
