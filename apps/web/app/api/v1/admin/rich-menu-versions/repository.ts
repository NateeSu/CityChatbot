import { InMemoryLineRichMenuProvider, RichMenuService, type RichMenuActor, type RichMenuDraftInput } from "@citychatbot/rich-menu";

import { isLocalSyntheticEnvironment, LOCAL_TENANT_ID } from "../../citizen/complaints/repository";
import { localAdminContext } from "../complaints/context";

export const LOCAL_RICH_MENU_ACCOUNT_ID = "10000000-0000-4000-8000-000000000003";
const LOCAL_SHA256 = "a".repeat(64);

export const localRichMenuProvider = new InMemoryLineRichMenuProvider();
export const localRichMenuService = new RichMenuService({
  provider: localRichMenuProvider,
  policy: {
    tenantId: LOCAL_TENANT_ID,
    allowedUriPrefixes: ["https://liff.line.me/", "https://citychatbot.local/"],
    enabledFeatures: ["complaints", "tracking", "news", "services", "contact"],
  },
});

let seeded = false;

const localFixture: RichMenuDraftInput = {
  tenantId: LOCAL_TENANT_ID,
  chatBarText: "เมนู",
  image: { contentType: "image/png", width: 2500, height: 1686, sizeBytes: 67_829, sha256: LOCAL_SHA256, storageKey: `private/tenants/${LOCAL_TENANT_ID}/rich-menu/RM-01-main.png` },
  areas: [
    { x: 0, y: 0, width: 1667, height: 1000, label: "แจ้งปัญหา", sortOrder: 0, action: { type: "URI", label: "แจ้งปัญหา", uri: "https://liff.line.me/citychatbot/complaints/new" } },
    { x: 1667, y: 0, width: 833, height: 1000, label: "ติดตามสถานะ", sortOrder: 1, action: { type: "URI", label: "ติดตามสถานะ", uri: "https://liff.line.me/citychatbot/complaints" } },
    { x: 0, y: 1000, width: 833, height: 686, label: "ข่าวสาร", sortOrder: 2, action: { type: "URI", label: "ข่าวสาร", uri: "https://citychatbot.local/news" } },
    { x: 833, y: 1000, width: 834, height: 686, label: "บริการ", sortOrder: 3, action: { type: "URI", label: "บริการ", uri: "https://citychatbot.local/services" } },
    { x: 1667, y: 1000, width: 833, height: 686, label: "ติดต่อ", sortOrder: 4, action: { type: "URI", label: "ติดต่อ", uri: "https://citychatbot.local/contact" } },
  ],
};

export const ensureLocalRichMenuFixtures = (): void => {
  if (!isLocalSyntheticEnvironment() || seeded) return;
  seeded = true;
  if (localRichMenuService.list(LOCAL_TENANT_ID, { tenantId: LOCAL_TENANT_ID, accountId: LOCAL_RICH_MENU_ACCOUNT_ID, role: "TENANT_ADMIN" }).length === 0) {
    localRichMenuService.create(localFixture, { tenantId: LOCAL_TENANT_ID, accountId: LOCAL_RICH_MENU_ACCOUNT_ID, role: "TENANT_ADMIN" }, "สร้าง fixture สังเคราะห์สำหรับ Rich Menu builder", "local-rich-menu-fixture-001");
  }
};

export const localRichMenuActor = (requestUrl: string): RichMenuActor | undefined => {
  const context = localAdminContext(new URL(requestUrl));
  if (!context || context.role !== "TENANT_ADMIN") return undefined;
  return { tenantId: context.tenantId, accountId: context.accountId, role: "TENANT_ADMIN" };
};
