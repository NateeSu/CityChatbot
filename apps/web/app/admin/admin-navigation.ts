export const ADMIN_ROLES = [
  "STAFF",
  "DEPARTMENT_HEAD",
  "PR_STAFF",
  "KNOWLEDGE_STAFF",
  "TENANT_ADMIN",
  "EXECUTIVE",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AdminIdentity = {
  tenantId: string;
  accountId: string;
  role: AdminRole;
  departmentIds: readonly string[];
  departmentLabel: string;
  synthetic: boolean;
};

export type AdminNavId = "dashboard" | "complaints" | "support" | "faq" | "departments" | "news" | "services" | "staff" | "bot-settings" | "theme-settings" | "rich-menu" | "reports" | "audit";

export type AdminNavItem = {
  id: AdminNavId;
  href: string;
  label: string;
  description: string;
  roles: readonly AdminRole[];
};

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { id: "dashboard", href: "/admin", label: "ภาพรวม", description: "ตัวชี้วัดและงานที่ต้องติดตาม", roles: ADMIN_ROLES },
  { id: "complaints", href: "/admin/complaints", label: "เรื่องร้องเรียน", description: "ค้นหาและติดตามเรื่องร้องเรียน", roles: ["STAFF", "DEPARTMENT_HEAD", "TENANT_ADMIN", "EXECUTIVE"] },
  { id: "support", href: "/admin/support-tickets", label: "งานส่งต่อ", description: "คิวเจ้าหน้าที่และ SLA", roles: ["STAFF", "DEPARTMENT_HEAD", "TENANT_ADMIN", "EXECUTIVE"] },
  { id: "faq", href: "/admin/faq-candidates", label: "คิวอนุมัติ FAQ", description: "ตรวจสอบแหล่งที่มาและอนุมัติความรู้", roles: ["STAFF", "DEPARTMENT_HEAD", "TENANT_ADMIN"] },
  { id: "departments", href: "/admin/departments", label: "หน่วยงานและ SLA", description: "ขอบเขตงาน สมาชิก SLA และช่องทางติดต่อ", roles: ["DEPARTMENT_HEAD", "TENANT_ADMIN"] },
  { id: "news", href: "/admin/news", label: "ข่าวเทศบาล", description: "ร่าง ตรวจสอบ กำหนดเวลา เผยแพร่ และส่งประกาศ", roles: ["PR_STAFF", "TENANT_ADMIN"] },
  { id: "services", href: "/admin/services", label: "บริการประชาชน", description: "ข้อมูลบริการ structured facts และแหล่งที่มา", roles: ["PR_STAFF", "TENANT_ADMIN", "DEPARTMENT_HEAD"] },
  { id: "staff", href: "/admin/staff", label: "เจ้าหน้าที่และสิทธิ์", description: "สมาชิก บทบาท คำเชิญ และการเข้าถึง", roles: ["TENANT_ADMIN"] },
  { id: "bot-settings", href: "/admin/settings/bot", label: "Bot และความปลอดภัย", description: "บุคลิก ข้อความ นโยบายล็อก และ test console", roles: ["TENANT_ADMIN"] },
  { id: "theme-settings", href: "/admin/settings/theme", label: "Theme และ branding", description: "สี โลโก้ accessibility preview และ version rollback", roles: ["TENANT_ADMIN"] },
  { id: "rich-menu", href: "/admin/settings/rich-menu", label: "Rich Menu", description: "จัดการเมนู LINE และ rollback", roles: ["TENANT_ADMIN"] },
  { id: "reports", href: "/admin/reports", label: "รายงาน KPI และ SLA", description: "ตัวเลขจาก SQL definition, trend, freshness และ export", roles: ["DEPARTMENT_HEAD", "TENANT_ADMIN", "EXECUTIVE"] },
  { id: "audit", href: "/admin/audit", label: "Audit และงานระบบ", description: "ตรวจสอบ audit, export, notification และ jobs ตามสิทธิ์", roles: ["TENANT_ADMIN", "EXECUTIVE"] },
];

export function navForRole(role: AdminRole): readonly AdminNavItem[] {
  return ADMIN_NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export function navHref(item: AdminNavItem, identity: Pick<AdminIdentity, "role">): string {
  return `${item.href}?role=${encodeURIComponent(identity.role)}`;
}

export function roleLabel(role: AdminRole): string {
  return {
    STAFF: "เจ้าหน้าที่",
    DEPARTMENT_HEAD: "หัวหน้าหน่วยงาน",
    PR_STAFF: "เจ้าหน้าที่ประชาสัมพันธ์",
    KNOWLEDGE_STAFF: "เจ้าหน้าที่คลังความรู้",
    TENANT_ADMIN: "ผู้ดูแลเทศบาล",
    EXECUTIVE: "ผู้บริหาร",
  }[role];
}
