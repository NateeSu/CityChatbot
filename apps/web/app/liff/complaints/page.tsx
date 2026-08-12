import { ComplaintList } from "./ComplaintTracking";
import { LOCAL_CITIZEN_IDENTITY, PRODUCTION_CITIZEN_IDENTITY } from "./tracking-config";

export default function ComplaintListPage() {
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  const identity = environment === "local" || environment === "test" ? LOCAL_CITIZEN_IDENTITY : PRODUCTION_CITIZEN_IDENTITY;
  return <ComplaintList identity={identity} />;
}
