import { z } from "zod";

export const reserveSchema = z.object({
  productId: z.string().uuid("Invalid product ID format"),
  warehouseId: z.string().uuid("Invalid warehouse ID format"),
  quantity: z
    .number()
    .int("Quantity must be an integer")
    .positive("Quantity must be a positive number"),
});

export type ReserveInput = z.infer<typeof reserveSchema>;
