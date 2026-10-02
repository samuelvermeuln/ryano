/** SAM-35 — "Meus atletas" do coach independente (sem escola). */
import { RosterScreen } from "@/app/professor/_athlete-hub/roster-screen";
import { INDEPENDENT_SCOPE } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

export default function IndependentRosterPage() {
  return <RosterScreen scope={INDEPENDENT_SCOPE} />;
}
