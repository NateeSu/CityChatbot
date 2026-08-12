import { ComplaintList } from "./ComplaintTracking";
import { LOCAL_CITIZEN_IDENTITY, PRODUCTION_CITIZEN_IDENTITY } from "./tracking-config";
import { ProductionComplaintList, ProductionLiffBoundary } from "../ProductionLiffGate";

export default function ComplaintListPage() {
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  if (environment === "production") return <ProductionLiffBoundary liffAppId={process.env.LIFF_APP_ID ?? ""}><ProductionComplaintList /></ProductionLiffBoundary>;
  const identity = environment === "local" || environment === "test" ? LOCAL_CITIZEN_IDENTITY : PRODUCTION_CITIZEN_IDENTITY;
  return <ComplaintList identity={identity} />;
}
