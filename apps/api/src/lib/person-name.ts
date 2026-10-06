import { z } from "zod";

// Format validation cannot establish identity or document ownership.
export const fullNameSchema = z.string().trim().max(100)
  .transform((value) => value.replace(/\s+/gu, " "))
  .refine((value) => /^[\p{L}\p{M}][\p{L}\p{M}'’.-]*(?: [\p{L}\p{M}][\p{L}\p{M}'’.-]*)+$/u.test(value),
    "Informe o nome completo, com nome e sobrenome.");
