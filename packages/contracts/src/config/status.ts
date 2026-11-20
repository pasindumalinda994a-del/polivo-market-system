import { z } from "zod";

/** Owner/host-visible local application observation for cloud-published config. */
export const LOCAL_APPLICATION_STATUSES = [
  "pending_delivery",
  "applied",
  "failed",
  "blocked",
] as const;
export const localApplicationStatusSchema = z.enum(LOCAL_APPLICATION_STATUSES);
export type LocalApplicationStatus = z.infer<typeof localApplicationStatusSchema>;
