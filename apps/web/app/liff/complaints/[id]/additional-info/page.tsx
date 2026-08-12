import { AdditionalInfo } from "../../ComplaintTracking";
import { LOCAL_CITIZEN_IDENTITY, PRODUCTION_CITIZEN_IDENTITY } from "../../tracking-config";
import { ProductionAdditionalInfo, ProductionLiffBoundary } from "../../../ProductionLiffGate";

export default async function AdditionalInfoPage({ params }: { params: Promise<{ id: string }> }) {
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  const { id } = await params;
  if (environment === "production") return <ProductionLiffBoundary liffAppId={process.env.LIFF_APP_ID ?? ""}><ProductionAdditionalInfo complaintId={id} /></ProductionLiffBoundary>;
  const identity = environment === "local" || environment === "test" ? LOCAL_CITIZEN_IDENTITY : PRODUCTION_CITIZEN_IDENTITY;
  return <AdditionalInfo complaintId={id} identity={identity} />;
}
