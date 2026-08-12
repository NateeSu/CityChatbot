export type Audience = 'citizen' | 'admin' | 'system'

export type ScreenKind =
  | 'richmenu-public'
  | 'chat-welcome'
  | 'chat-answer'
  | 'chat-clarify'
  | 'chat-handoff'
  | 'complaint-form'
  | 'complaint-media'
  | 'contact-consent'
  | 'complaint-review'
  | 'complaint-success'
  | 'tracking-list'
  | 'tracking-detail'
  | 'additional-info'
  | 'news-list'
  | 'news-detail'
  | 'services'
  | 'service-detail'
  | 'contact-directory'
  | 'citation-viewer'
  | 'help-privacy'
  | 'dashboard'
  | 'complaint-list'
  | 'complaint-detail'
  | 'ticket-list'
  | 'ticket-detail'
  | 'knowledge-list'
  | 'knowledge-upload'
  | 'knowledge-detail'
  | 'answer-test'
  | 'evaluation-suites'
  | 'bot-personality'
  | 'bot-safety'
  | 'news-admin-list'
  | 'news-editor'
  | 'department-list'
  | 'department-detail'
  | 'routing-test'
  | 'sla-builder'
  | 'staff-rbac'
  | 'kpi'
  | 'theme'
  | 'richmenu'
  | 'settings-center'
  | 'audit-log'
  | 'tenant-list'
  | 'tenant-provision'

export interface ScreenDefinition {
  id: string
  title: string
  shortTitle: string
  description: string
  audience: Audience
  kind: ScreenKind
  route: string
  concept: string
  primaryAction: string
}

const conceptPath = '/gui-designs/concepts/'

export const screens: ScreenDefinition[] = [
  {
    id: 'RM-01', title: 'LINE Rich Menu', shortTitle: 'เมนูบริการ',
    description: 'เมนู 5 ทางลัดพร้อมไอคอนและข้อความสำรองสำหรับ LINE OA', audience: 'citizen', kind: 'richmenu-public', route: '/screen/RM-01',
    concept: `${conceptPath}concept-citizen-mobile.png`, primaryAction: 'เลือกบริการ',
  },
  {
    id: 'CHAT-01', title: 'LINE Welcome', shortTitle: 'ยินดีต้อนรับ',
    description: 'ข้อความต้อนรับ ขอบเขตบริการ และ quick replies ที่เริ่มต้นได้ทันที', audience: 'citizen', kind: 'chat-welcome', route: '/screen/CHAT-01',
    concept: `${conceptPath}concept-citizen-mobile.png`, primaryAction: 'เริ่มถาม',
  },
  {
    id: 'CHAT-02', title: 'Grounded Answer', shortTitle: 'คำตอบพร้อมหลักฐาน',
    description: 'คำตอบที่มีแหล่งอ้างอิง วันที่มีผล ขั้นตอนถัดไป และ feedback', audience: 'citizen', kind: 'chat-answer', route: '/screen/CHAT-02',
    concept: `${conceptPath}concept-citizen-mobile.png`, primaryAction: 'ถามต่อ',
  },
  {
    id: 'CHAT-03', title: 'Clarify', shortTitle: 'ขอข้อมูลเพิ่ม',
    description: 'ถามกลับเพียงหนึ่งคำถามพร้อมตัวเลือกไม่เกิน 4 รายการ', audience: 'citizen', kind: 'chat-clarify', route: '/screen/CHAT-03',
    concept: `${conceptPath}concept-citizen-mobile.png`, primaryAction: 'เลือกคำตอบ',
  },
  {
    id: 'CHAT-04', title: 'Human Handoff', shortTitle: 'ส่งต่อเจ้าหน้าที่',
    description: 'ยืนยันเลข ticket หน่วยงาน ขั้นตอนถัดไป และช่องทางติดตาม', audience: 'citizen', kind: 'chat-handoff', route: '/screen/CHAT-04',
    concept: `${conceptPath}concept-citizen-mobile.png`, primaryAction: 'ติดตามคำถาม',
  },
  {
    id: 'C-01',
    title: 'หน้าแรก LIFF และทางลัดหลัก',
    shortTitle: 'หน้าแรก',
    description: 'จุดเริ่มต้นสำหรับถามคำถาม เลือกบริการ แจ้งปัญหา และติดตามสถานะ',
    audience: 'citizen',
    kind: 'chat-welcome',
    route: '/screen/C-01',
    concept: `${conceptPath}concept-citizen-mobile.png`,
    primaryAction: 'เลือกบริการ',
  },
  {
    id: 'C-02',
    title: 'แจ้งปัญหา — ขั้นตอนที่ 1',
    shortTitle: 'แจ้งปัญหา',
    description: 'แบบฟอร์มขั้นแรกสำหรับระบุประเภท รายละเอียด รูปภาพ และตำแหน่ง',
    audience: 'citizen',
    kind: 'complaint-form',
    route: '/screen/C-02',
    concept: `${conceptPath}concept-citizen-mobile.png`,
    primaryAction: 'ถัดไป',
  },
  {
    id: 'C-07',
    title: 'ส่งเรื่องสำเร็จ',
    shortTitle: 'รับเรื่องแล้ว',
    description: 'ยืนยันเลขคำร้อง ขั้นตอนถัดไป และช่องทางติดตามสถานะ',
    audience: 'citizen',
    kind: 'complaint-success',
    route: '/screen/C-07',
    concept: `${conceptPath}concept-citizen-mobile.png`,
    primaryAction: 'ติดตามสถานะ',
  },
  {
    id: 'C-03', title: 'แจ้งปัญหา — รูปภาพและตำแหน่ง', shortTitle: 'แนบหลักฐาน',
    description: 'แนบรูป ปักหมุด แสดงความคืบหน้าอัปโหลด และจัดการไฟล์ที่อัปโหลดไม่สำเร็จ', audience: 'citizen', kind: 'complaint-media', route: '/screen/C-03',
    concept: `${conceptPath}concept-citizen-mobile.png`, primaryAction: 'บันทึกและถัดไป',
  },
  {
    id: 'C-04', title: 'แจ้งปัญหา — ผู้ติดต่อและความยินยอม', shortTitle: 'ข้อมูลผู้ติดต่อ',
    description: 'ตรวจข้อมูลติดต่อ เลือกช่องทางแจ้งเตือน และให้ความยินยอมอย่างชัดเจน', audience: 'citizen', kind: 'contact-consent', route: '/screen/C-04',
    concept: `${conceptPath}concept-citizen-mobile.png`, primaryAction: 'บันทึกและถัดไป',
  },
  {
    id: 'C-05', title: 'แจ้งปัญหา — ตรวจสอบและส่ง', shortTitle: 'ตรวจสอบข้อมูล',
    description: 'ทบทวนข้อมูลทั้งหมดก่อนยืนยัน พร้อมแก้ไขเป็นรายส่วน', audience: 'citizen', kind: 'complaint-review', route: '/screen/C-05',
    concept: `${conceptPath}concept-citizen-mobile.png`, primaryAction: 'ยืนยันและส่ง',
  },
  {
    id: 'C-08',
    title: 'รายการติดตามสถานะ',
    shortTitle: 'ติดตามสถานะ',
    description: 'ค้นหาและกรองคำร้องของผู้ใช้ พร้อมสถานะล่าสุดที่เข้าใจง่าย',
    audience: 'citizen',
    kind: 'tracking-list',
    route: '/screen/C-08',
    concept: `${conceptPath}concept-citizen-services-tracking.png`,
    primaryAction: 'ดูรายละเอียด',
  },
  {
    id: 'C-09',
    title: 'รายละเอียดการติดตาม',
    shortTitle: 'รายละเอียดคำร้อง',
    description: 'ไทม์ไลน์สาธารณะ หลักฐานล่าสุด และขั้นตอนที่กำลังดำเนินการ',
    audience: 'citizen',
    kind: 'tracking-detail',
    route: '/screen/C-09',
    concept: `${conceptPath}concept-citizen-services-tracking.png`,
    primaryAction: 'ส่งข้อมูลเพิ่มเติม',
  },
  {
    id: 'C-13',
    title: 'ข่าวประชาสัมพันธ์',
    shortTitle: 'ข่าวเทศบาล',
    description: 'ประกาศสำคัญ ข่าวล่าสุด หมวดข่าว และรายละเอียดที่อ่านง่ายบนมือถือ',
    audience: 'citizen',
    kind: 'news-list',
    route: '/screen/C-13',
    concept: `${conceptPath}concept-citizen-services-tracking.png`,
    primaryAction: 'อ่านข่าว',
  },
  {
    id: 'C-10', title: 'ส่งข้อมูลเพิ่มเติม', shortTitle: 'เพิ่มข้อมูลคำร้อง',
    description: 'ส่งข้อความและไฟล์เพิ่มจากหน้ารายละเอียดคำร้อง พร้อมบอกการมองเห็น', audience: 'citizen', kind: 'additional-info', route: '/screen/C-10',
    concept: `${conceptPath}concept-citizen-services-tracking.png`, primaryAction: 'ส่งข้อมูล',
  },
  {
    id: 'C-14', title: 'รายละเอียดข่าวประชาสัมพันธ์', shortTitle: 'รายละเอียดข่าว',
    description: 'บทความอ่านง่าย ไฟล์แนบ วันที่เผยแพร่ และปุ่มแชร์', audience: 'citizen', kind: 'news-detail', route: '/screen/C-14',
    concept: `${conceptPath}concept-citizen-services-tracking.png`, primaryAction: 'แชร์ข่าว',
  },
  {
    id: 'C-15',
    title: 'ค้นหาบริการเทศบาล',
    shortTitle: 'บริการเทศบาล',
    description: 'ค้นบริการตามภารกิจ หมวดงาน เอกสารที่ต้องใช้ และหน่วยงานรับผิดชอบ',
    audience: 'citizen',
    kind: 'services',
    route: '/screen/C-15',
    concept: `${conceptPath}concept-citizen-services-tracking.png`,
    primaryAction: 'ค้นหาบริการ',
  },
  {
    id: 'C-18',
    title: 'ติดต่อหน่วยงาน',
    shortTitle: 'ติดต่อเทศบาล',
    description: 'ค้นหาหน่วยงาน เบอร์โทร เวลาทำการ ที่ตั้ง และเส้นทางไปเทศบาล',
    audience: 'citizen',
    kind: 'contact-directory',
    route: '/screen/C-18',
    concept: `${conceptPath}concept-citizen-services-tracking.png`,
    primaryAction: 'โทรติดต่อ',
  },
  {
    id: 'C-16', title: 'รายละเอียดบริการเทศบาล', shortTitle: 'รายละเอียดบริการ',
    description: 'ขั้นตอน เอกสาร ค่าธรรมเนียม แหล่งข้อมูล และช่องทางติดต่อ', audience: 'citizen', kind: 'service-detail', route: '/screen/C-16',
    concept: `${conceptPath}concept-citizen-services-tracking.png`, primaryAction: 'เริ่มใช้บริการ',
  },
  {
    id: 'C-19', title: 'ตัวแสดงแหล่งอ้างอิง', shortTitle: 'แหล่งอ้างอิง',
    description: 'ข้อความฉบับเผยแพร่ เวอร์ชัน วันที่มีผล และตำแหน่งในเอกสาร', audience: 'citizen', kind: 'citation-viewer', route: '/screen/C-19',
    concept: `${conceptPath}concept-knowledge-ai.png`, primaryAction: 'ดาวน์โหลดเอกสาร',
  },
  {
    id: 'C-20', title: 'ความช่วยเหลือและความเป็นส่วนตัว', shortTitle: 'ช่วยเหลือและสิทธิ์',
    description: 'วิธีใช้ การเข้าถึง นโยบายความเป็นส่วนตัว และประวัติความยินยอม', audience: 'citizen', kind: 'help-privacy', route: '/screen/C-20',
    concept: `${conceptPath}concept-citizen-services-tracking.png`, primaryAction: 'ติดต่อเจ้าหน้าที่',
  },
  {
    id: 'A-10',
    title: 'Dashboard ตามบทบาท',
    shortTitle: 'ภาพรวม',
    description: 'สรุปเรื่องร้องเรียน SLA ภาระงาน พื้นที่เกิดเหตุ และสัญญาณสำคัญ',
    audience: 'admin',
    kind: 'dashboard',
    route: '/screen/A-10',
    concept: `${conceptPath}concept-admin-dashboard.png`,
    primaryAction: 'ดูเรื่องเร่งด่วน',
  },
  {
    id: 'A-20',
    title: 'รายการเรื่องร้องเรียน',
    shortTitle: 'เรื่องร้องเรียน',
    description: 'ตารางงานที่ค้นหา กรอง เลือกหลายรายการ และมอบหมายได้',
    audience: 'admin',
    kind: 'complaint-list',
    route: '/screen/A-20',
    concept: `${conceptPath}concept-complaint-operations.png`,
    primaryAction: 'มอบหมายงาน',
  },
  {
    id: 'A-25',
    title: 'รายละเอียดเรื่องร้องเรียน',
    shortTitle: 'รายละเอียดเรื่อง',
    description: 'พื้นที่ทำงานครบวงจรสำหรับตรวจหลักฐาน มอบหมาย เปลี่ยนสถานะ และบันทึกไทม์ไลน์',
    audience: 'admin',
    kind: 'complaint-detail',
    route: '/screen/A-25',
    concept: `${conceptPath}concept-complaint-operations.png`,
    primaryAction: 'ยืนยันและมอบหมาย',
  },
  {
    id: 'A-30',
    title: 'คิวคำถามประชาชน',
    shortTitle: 'คิวคำถาม',
    description: 'คิว Human Handoff ที่จัดลำดับด้วย SLA ช่องทาง และความพร้อมของหลักฐาน',
    audience: 'admin',
    kind: 'ticket-list',
    route: '/screen/A-30',
    concept: `${conceptPath}concept-responsive-support-ticket.png`,
    primaryAction: 'เปิดคำถาม',
  },
  {
    id: 'A-31',
    title: 'ตอบคำถามประชาชน',
    shortTitle: 'ตอบคำถาม',
    description: 'รายละเอียดคำถาม เหตุผลที่ AI ส่งต่อ หลักฐาน และตัวแก้ไขคำตอบ LINE',
    audience: 'admin',
    kind: 'ticket-detail',
    route: '/screen/A-31',
    concept: `${conceptPath}concept-responsive-support-ticket.png`,
    primaryAction: 'ตอบผ่าน LINE',
  },
  {
    id: 'A-40',
    title: 'คลังความรู้',
    shortTitle: 'คลังความรู้',
    description: 'รายการเอกสารแบบมีเวอร์ชัน สถานะประมวลผล และสัญญาณคุณภาพ',
    audience: 'admin',
    kind: 'knowledge-list',
    route: '/screen/A-40',
    concept: `${conceptPath}concept-knowledge-ai.png`,
    primaryAction: 'อัปโหลดเอกสาร',
  },
  {
    id: 'A-41',
    title: 'อัปโหลดเอกสารเข้าคลังความรู้',
    shortTitle: 'อัปโหลดเอกสาร',
    description: 'ตัวช่วยแบบเป็นขั้นตอนสำหรับไฟล์ หน่วยงาน ช่วงมีผล และการตรวจสอบก่อนประมวลผล',
    audience: 'admin',
    kind: 'knowledge-upload',
    route: '/screen/A-41',
    concept: `${conceptPath}concept-knowledge-ai.png`,
    primaryAction: 'เริ่มประมวลผล',
  },
  {
    id: 'A-46',
    title: 'ห้องทดลองคำตอบ AI',
    shortTitle: 'AI Test Lab',
    description: 'ค้นหลักฐาน ร่างคำตอบ ประเมินความเพียงพอ และส่งต่อเมื่อหลักฐานไม่พอ',
    audience: 'admin',
    kind: 'answer-test',
    route: '/screen/A-46',
    concept: `${conceptPath}concept-knowledge-ai.png`,
    primaryAction: 'ทดสอบคำถาม',
  },
  {
    id: 'A-47',
    title: 'ชุดประเมินความแม่นยำ',
    shortTitle: 'Evaluation Suites',
    description: 'จัดชุดคำถามมาตรฐาน เกณฑ์ให้คะแนน ผล regression และรายการที่ต้องทบทวน',
    audience: 'admin',
    kind: 'evaluation-suites',
    route: '/screen/A-47',
    concept: `${conceptPath}concept-knowledge-ai.png`,
    primaryAction: 'เริ่มประเมิน',
  },
  {
    id: 'A-60',
    title: 'รายการข่าวประชาสัมพันธ์',
    shortTitle: 'จัดการข่าว',
    description: 'ค้นหา กรองสถานะ ตั้งเวลา และตรวจช่องทางเผยแพร่ข่าวของเทศบาล',
    audience: 'admin',
    kind: 'news-admin-list',
    route: '/screen/A-60',
    concept: `${conceptPath}concept-settings-richmenu-theme.png`,
    primaryAction: 'เพิ่มข่าว',
  },
  {
    id: 'A-61',
    title: 'ตัวแก้ไขข่าวประชาสัมพันธ์',
    shortTitle: 'เขียนข่าว',
    description: 'เขียนเนื้อหา แนบภาพ ตั้งเวลาพร้อมตัวอย่าง LINE และความช่วยเหลือจาก AI แบบร่างเท่านั้น',
    audience: 'admin',
    kind: 'news-editor',
    route: '/screen/A-61',
    concept: `${conceptPath}concept-settings-richmenu-theme.png`,
    primaryAction: 'บันทึกและตรวจสอบ',
  },
  {
    id: 'A-70',
    title: 'หน่วยงานและผู้รับผิดชอบ',
    shortTitle: 'หน่วยงาน',
    description: 'ภาพรวมหน่วยงาน ขอบเขตงาน ช่องทางติดต่อ สมาชิก และสุขภาพ SLA',
    audience: 'admin',
    kind: 'department-list',
    route: '/screen/A-70',
    concept: `${conceptPath}concept-settings-richmenu-theme.png`,
    primaryAction: 'เพิ่มหน่วยงาน',
  },
  {
    id: 'A-74',
    title: 'ตัวสร้างกฎ SLA',
    shortTitle: 'กฎ SLA',
    description: 'สร้างกฎเวลาตอบรับและแก้ไขตามหมวด ความสำคัญ หน่วยงาน ปฏิทิน และลำดับ escalation',
    audience: 'admin',
    kind: 'sla-builder',
    route: '/screen/A-74',
    concept: `${conceptPath}concept-settings-richmenu-theme.png`,
    primaryAction: 'บันทึกกฎ SLA',
  },
  {
    id: 'A-75',
    title: 'เจ้าหน้าที่และสิทธิ์',
    shortTitle: 'Staff & RBAC',
    description: 'ค้นหาเจ้าหน้าที่ จัดบทบาท ขอบเขตหน่วยงาน สถานะบัญชี และตรวจสิทธิ์ก่อนบันทึก',
    audience: 'admin',
    kind: 'staff-rbac',
    route: '/screen/A-75',
    concept: `${conceptPath}concept-settings-richmenu-theme.png`,
    primaryAction: 'เชิญเจ้าหน้าที่',
  },
  {
    id: 'A-80',
    title: 'รายงาน KPI และ SLA',
    shortTitle: 'รายงาน',
    description: 'เปรียบเทียบผลลัพธ์ตามหน่วยงาน แนวโน้ม SLA ความพึงพอใจ และความแม่นยำ AI',
    audience: 'admin',
    kind: 'kpi',
    route: '/screen/A-80',
    concept: `${conceptPath}concept-admin-dashboard.png`,
    primaryAction: 'ส่งออกรายงาน',
  },
  {
    id: 'A-91',
    title: 'ธีมและการเข้าถึง',
    shortTitle: 'ธีมระบบ',
    description: 'จัดการสี ตัวอักษร โลโก้ contrast และตัวอย่างการแสดงผลทุกช่องทาง',
    audience: 'admin',
    kind: 'theme',
    route: '/screen/A-91',
    concept: `${conceptPath}concept-settings-richmenu-theme.png`,
    primaryAction: 'บันทึกธีม',
  },
  {
    id: 'A-93',
    title: 'ตัวออกแบบ Rich Menu',
    shortTitle: 'Rich Menu',
    description: 'เลือกเลย์เอาต์ จัดลำดับเมนู ดูตัวอย่างบนโทรศัพท์ และเผยแพร่แบบมีเวอร์ชัน',
    audience: 'admin',
    kind: 'richmenu',
    route: '/screen/A-93',
    concept: `${conceptPath}concept-settings-richmenu-theme.png`,
    primaryAction: 'เผยแพร่',
  },
  {
    id: 'A-97',
    title: 'บันทึก Audit',
    shortTitle: 'Audit Log',
    description: 'ค้นหาเหตุการณ์สำคัญตามผู้ใช้ การกระทำ ทรัพยากร เวลา และดูรายละเอียดก่อน–หลัง',
    audience: 'admin',
    kind: 'audit-log',
    route: '/screen/A-97',
    concept: `${conceptPath}concept-settings-richmenu-theme.png`,
    primaryAction: 'ส่งออกบันทึก',
  },
  {
    id: 'S-01',
    title: 'รายการ Tenant',
    shortTitle: 'จัดการ Tenant',
    description: 'จัดการผู้เช่า แพ็กเกจ สถานะเปิดใช้งาน โมดูล และความพร้อมก่อน go-live',
    audience: 'system',
    kind: 'tenant-list',
    route: '/screen/S-01',
    concept: `${conceptPath}concept-settings-richmenu-theme.png`,
    primaryAction: 'เพิ่มเทศบาล',
  },
  {
    id: 'S-02',
    title: 'ตัวช่วยสร้าง Tenant',
    shortTitle: 'Provision Tenant',
    description: 'สร้างเทศบาลใหม่แบบเป็นขั้นตอน ตั้งค่าเจ้าของ แบรนด์ LINE OA โมดูล และตรวจความพร้อม',
    audience: 'system',
    kind: 'tenant-provision',
    route: '/screen/S-02',
    concept: `${conceptPath}concept-settings-richmenu-theme.png`,
    primaryAction: 'สร้าง Tenant',
  },
]

export const screenMap = new Map(screens.map((screen) => [screen.id, screen]))

export const audienceLabels: Record<Audience, string> = {
  citizen: 'ประชาชน',
  admin: 'เจ้าหน้าที่',
  system: 'ผู้ดูแลระบบกลาง',
}

export function findScreenFromLocation(location: Location): ScreenDefinition | undefined {
  const queryId = new URLSearchParams(location.search).get('screen')?.toUpperCase()
  const routeId = location.pathname.match(/\/screen\/([^/]+)/)?.[1]?.toUpperCase()
  return screenMap.get(queryId ?? routeId ?? '')
}
