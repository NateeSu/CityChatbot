import { ComplaintWizard, type ComplaintWizardConfig } from "./ComplaintWizard";
import Link from "next/link";
import { ProductionComplaintWizard, ProductionLiffBoundary } from "../../ProductionLiffGate";

const LOCAL_CATEGORIES = [
  { id: "33000000-0000-4000-8000-000000000001", code: "WASTE", label: "ขยะ / สิ่งปฏิกูล" },
  { id: "33000000-0000-4000-8000-000000000002", code: "ROAD", label: "ถนน / ทางเท้า" },
] as const;

const LOCAL_CONFIG: ComplaintWizardConfig = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  intakeQueueId: "34000000-0000-4000-8000-000000000001",
  lineUserId: "U11111111111111111111111111111111",
  tenantName: "เทศบาลเมืองตัวอย่าง",
  consentVersion: "privacy-2026-01",
  categories: LOCAL_CATEGORIES,
  synthetic: true,
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const loadProductionConfig = (): ComplaintWizardConfig | undefined => {
  const tenantId = process.env.COMPLAINT_TENANT_ID;
  const intakeQueueId = process.env.COMPLAINT_INTAKE_QUEUE_ID;
  const tenantName = process.env.COMPLAINT_TENANT_NAME;
  const consentVersion = process.env.COMPLAINT_CONSENT_VERSION;
  if (!tenantId || !intakeQueueId || !tenantName || !consentVersion || !UUID_PATTERN.test(tenantId) || !UUID_PATTERN.test(intakeQueueId)) return undefined;
  try {
    const categories: unknown = JSON.parse(process.env.COMPLAINT_CATEGORIES_JSON ?? "");
    if (!Array.isArray(categories) || categories.length === 0) return undefined;
    const normalized = categories.filter((category): category is { id: string; code: string; label: string } =>
      typeof category === "object" && category !== null
      && typeof (category as { id?: unknown }).id === "string"
      && typeof (category as { code?: unknown }).code === "string"
      && typeof (category as { label?: unknown }).label === "string"
      && UUID_PATTERN.test((category as { id: string }).id)
    );
    if (normalized.length !== categories.length) return undefined;
    return { tenantId, intakeQueueId, lineUserId: "", tenantName, consentVersion, categories: normalized, synthetic: false };
  } catch {
    return undefined;
  }
};

export default function NewComplaintPage() {
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  if (environment === "production") return <ProductionLiffBoundary liffAppId={process.env.LIFF_APP_ID ?? ""}><ProductionComplaintWizard /></ProductionLiffBoundary>;
  const config = environment === "local" || environment === "test" ? LOCAL_CONFIG : loadProductionConfig();
  if (!config) {
    return (
      <main className="wizard-shell wizard-unavailable">
        <section className="wizard-unavailable__card" role="alert" aria-labelledby="complaint-config-title">
          <span className="wizard-unavailable__icon" aria-hidden="true">!</span>
          <h1 id="complaint-config-title">ระบบแจ้งปัญหายังไม่พร้อม</h1>
          <p>ไม่พบการตั้งค่าของเทศบาลสำหรับหน้านี้ กรุณาติดต่อผู้ดูแลระบบ</p>
          <Link className="wizard-button wizard-button--secondary" href="/">กลับหน้าหลัก</Link>
        </section>
      </main>
    );
  }
  return <ComplaintWizard config={config} />;
}
