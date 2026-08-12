import { FeatureDisabledState } from "../ui/states";

import { LiffHome, type LiffCitizenIdentity } from "./LiffHome";
import { ProductionLiffGate } from "./ProductionLiffGate";

const LOCAL_IDENTITY: LiffCitizenIdentity = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  lineUserId: "U11111111111111111111111111111111",
  tenantName: "เทศบาลเมืองตัวอย่าง",
  synthetic: true,
};

export default function LiffHomePage() {
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  if (environment === "production") return <ProductionLiffGate liffAppId={process.env.LIFF_APP_ID ?? ""} />;
  if (environment !== "local" && environment !== "test") return <main className="liff-unavailable"><FeatureDisabledState /></main>;
  return <LiffHome identity={LOCAL_IDENTITY} />;
}
