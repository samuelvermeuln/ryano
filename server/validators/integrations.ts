import { z } from "zod";

export const garminConnectSchema = z.object({
  email: z.email("Informe email Garmin válido.").trim().toLowerCase(),
  password: z.string().min(1, "Informe senha Garmin."),
});
