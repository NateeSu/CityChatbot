import type { ReactNode } from "react";

type StateAction = ReactNode;

function StateSurface({ state, title, message, action, role = "status", busy = false }: { state: string; title: string; message: string; action?: StateAction; role?: "status" | "alert"; busy?: boolean }) {
  return (
    <section aria-busy={busy || undefined} aria-live={role === "alert" ? "assertive" : "polite"} className={`cc-state cc-state--${state}`} data-ui-state={state} role={role}>
      <span aria-hidden="true" className="cc-state__icon" />
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
        {action ? <div className="cc-state__action">{action}</div> : null}
      </div>
    </section>
  );
}

export function LoadingState({ title = "กำลังโหลดข้อมูล", message = "โปรดรอสักครู่…" }: { title?: string; message?: string }) {
  return <StateSurface busy message={message} state="loading" title={title} />;
}

export function EmptyState({ title = "ยังไม่มีข้อมูล", message = "เมื่อมีข้อมูลใหม่ ระบบจะแสดงที่หน้านี้", action }: { title?: string; message?: string; action?: StateAction }) {
  return <StateSurface action={action} message={message} state="empty" title={title} />;
}

export function ErrorState({ title = "โหลดข้อมูลไม่สำเร็จ", message = "กรุณาลองใหม่อีกครั้ง", action }: { title?: string; message?: string; action?: StateAction }) {
  return <StateSurface action={action} message={message} role="alert" state="error" title={title} />;
}

export function OfflineState({ action }: { action?: StateAction }) {
  return <StateSurface action={action} message="ตรวจสอบการเชื่อมต่อ ระบบจะลองใหม่เมื่อกลับมาออนไลน์" state="offline" title="ออฟไลน์อยู่" />;
}

export function PermissionDeniedState({ action }: { action?: StateAction }) {
  return <StateSurface action={action} message="บัญชีหรือเซสชันนี้ไม่มีสิทธิ์ดูข้อมูลส่วนนี้" state="permission" title="ไม่มีสิทธิ์เข้าถึง" role="alert" />;
}

export function ExpiredSessionState({ action }: { action?: StateAction }) {
  return <StateSurface action={action} message="กรุณาเริ่มเซสชันใหม่เพื่อทำรายการต่อ" state="expired" title="เซสชันหมดอายุ" role="alert" />;
}

export function StaleState({ action }: { action?: StateAction }) {
  return <StateSurface action={action} message="ข้อมูลชุดนี้อาจไม่ใช่ค่าล่าสุด กรุณารีเฟรชก่อนตัดสินใจ" state="stale" title="ข้อมูลอาจเก่า" />;
}

export function ConflictState({ action }: { action?: StateAction }) {
  return <StateSurface action={action} message="มีผู้ใช้อื่นแก้ไขข้อมูลแล้ว โหลดค่าล่าสุดก่อนบันทึกอีกครั้ง" state="conflict" title="ข้อมูลชนกัน" role="alert" />;
}

export function FeatureDisabledState({ action }: { action?: StateAction }) {
  return <StateSurface action={action} message="ฟังก์ชันนี้ยังไม่เปิดใช้งานในสภาพแวดล้อมปัจจุบัน" state="disabled" title="ยังไม่เปิดใช้งาน" />;
}
