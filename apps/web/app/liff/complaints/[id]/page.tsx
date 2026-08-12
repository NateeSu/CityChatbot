import { ComplaintDetail } from "../ComplaintTracking";
import { LOCAL_CITIZEN_IDENTITY, PRODUCTION_CITIZEN_IDENTITY } from "../tracking-config";
import { ProductionComplaintDetail, ProductionLiffBoundary } from "../../ProductionLiffGate";

export default async function ComplaintDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  const { id } = await params;
  if (environment === "production") return <ProductionLiffBoundary liffAppId={process.env.LIFF_APP_ID ?? ""}><ProductionComplaintDetail complaintId={id} /></ProductionLiffBoundary>;
  const identity = environment === "local" || environment === "test" ? LOCAL_CITIZEN_IDENTITY : PRODUCTION_CITIZEN_IDENTITY;
  return <ComplaintDetail complaintId={id} identity={identity} />;
}
