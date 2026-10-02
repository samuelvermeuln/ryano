/**
 * SAM-42 — the `ProviderSecretsAccessor` the core hands to a provider module
 * (`ProviderContext.secrets`): reads one secret of one connection from the
 * encrypted vault, by name. Values never leave this function except to the
 * caller; nothing is logged.
 */
import type { PrismaClient, SecretType } from "@prisma/client";
import { decryptSecret } from "@/server/crypto/secret-vault";
import type { ProviderSecretsAccessor } from "../contracts";

export function createVaultSecretsAccessor(
  db: Pick<PrismaClient, "wearableSecret">,
  connectionId: string,
): ProviderSecretsAccessor {
  return {
    async getSecret(type: string): Promise<string | null> {
      const row = await db.wearableSecret.findUnique({
        where: { wearableConnectionId_secretType: { wearableConnectionId: connectionId, secretType: type as SecretType } },
      });
      return row ? decryptSecret(row) : null;
    },
  };
}
