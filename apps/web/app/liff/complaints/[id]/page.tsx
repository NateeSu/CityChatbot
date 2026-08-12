import { ComplaintDetail } from "../ComplaintTracking";
import { LOCAL_CITIZEN_IDENTITY, PRODUCTION_CITIZEN_IDENTITY } from "../tracking-config";

export default async function ComplaintDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  const identity = environment === "local" || environment === "test" ? LOCAL_CITIZEN_IDENTITY : PRODUCTION_CITIZEN_IDENTITY;
  const { id } = await params;
  return <ComplaintDetail complaintId={id} identity={identity} />;
}
