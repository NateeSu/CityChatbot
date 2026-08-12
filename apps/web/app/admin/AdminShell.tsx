"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useTheme } from "../ui/theme";
import { ADMIN_NAV_ITEMS, navForRole, navHref, roleLabel, type AdminIdentity, type AdminNavId } from "./admin-navigation";
import "./admin-shell.css";

type AdminShellProps = {
  identity: AdminIdentity;
  activeId: AdminNavId;
  breadcrumbs?: readonly string[];
  notificationCount?: number;
  children: ReactNode;
};

export function AdminShell({ identity, activeId, breadcrumbs = [], notificationCount = 0, children }: AdminShellProps) {
  const { theme, cycleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const allowedItems = useMemo(() => navForRole(identity.role), [identity.role]);
  const supportItem = allowedItems.find((item) => item.id === "support");
  const searchItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("th-TH");
    if (!normalized) return allowedItems;
    return allowedItems.filter((item) => `${item.label} ${item.description}`.toLocaleLowerCase("th-TH").includes(normalized));
  }, [allowedItems, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setMenuOpen(false);
        setNotificationsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return <div className="admin-app-shell" data-theme={theme}>
    <aside className={`admin-app-sidebar${menuOpen ? " is-open" : ""}`} aria-label="เมนูผู้ดูแลระบบ">
      <div className="admin-app-brand"><span aria-hidden="true" className="admin-app-brand__mark">▥</span><div><strong>ศูนย์บริการประชาชน</strong><small>CityChatbot Admin</small></div></div>
      <nav className="admin-app-nav" id="admin-navigation" aria-label="เมนูหลัก">
        {allowedItems.map((item) => <Link aria-current={activeId === item.id ? "page" : undefined} href={navHref(item, identity)} key={item.id} onClick={() => setMenuOpen(false)}><span aria-hidden="true">{item.id === "dashboard" ? "⌂" : item.id === "complaints" ? "▣" : item.id === "support" ? "↗" : item.id === "faq" ? "✓" : item.id === "news" ? "▤" : item.id === "services" ? "⌂" : item.id === "staff" ? "♙" : item.id === "audit" ? "⌕" : item.id === "bot-settings" ? "✦" : item.id === "theme-settings" ? "◒" : "⚙"}</span><span>{item.label}</span></Link>)}
      </nav>
      <div className="admin-app-sidebar__user"><strong>{roleLabel(identity.role)}</strong><small>{identity.departmentLabel}</small></div>
    </aside>
    {menuOpen ? <button aria-label="ปิดเมนู" className="admin-app-backdrop" onClick={() => setMenuOpen(false)} type="button" /> : null}
    <div className="admin-app-main">
      <header className="admin-app-topbar">
        <button aria-controls="admin-navigation" aria-expanded={menuOpen} aria-label="เปิดเมนูหลัก" className="admin-app-menu-button" onClick={() => setMenuOpen((current) => !current)} type="button">☰</button>
        <form className="admin-app-search" onSubmit={(event) => event.preventDefault()} role="search"><label htmlFor="admin-command-search">ค้นหาเมนูและงาน</label><input id="admin-command-search" onChange={(event) => setQuery(event.target.value)} placeholder="พิมพ์เพื่อค้นหา หรือกด /" ref={searchRef} value={query} /><kbd>/</kbd></form>
        <div className="admin-app-tools">
          <span className="admin-app-tenant" title={identity.tenantId || "ยังไม่ผูก session"}>เทศบาลเมืองตัวอย่าง<small>{identity.departmentLabel}</small></span>
          <button aria-expanded={notificationsOpen} aria-haspopup="dialog" aria-label={`การแจ้งเตือน${notificationCount > 0 ? ` ${notificationCount} รายการ` : ""}`} className="admin-app-icon-button" onClick={() => setNotificationsOpen((current) => !current)} type="button">♧{notificationCount > 0 ? <span className="admin-app-notification-count">{notificationCount > 99 ? "99+" : notificationCount}</span> : null}</button>
          <button aria-label="เปลี่ยนธีม" className="admin-app-icon-button" onClick={cycleTheme} type="button">{theme === "light" ? "☼" : theme === "dark" ? "◐" : "◉"}</button>
        </div>
      </header>
      {query.trim() ? <div className="admin-app-command-results" role="dialog" aria-label="ผลการค้นหา"><strong>ผลการค้นหา</strong>{searchItems.length === 0 ? <p>ไม่พบเมนูที่ตรงกัน</p> : <ul>{searchItems.map((item) => <li key={item.id}><Link href={navHref(item, identity)} onClick={() => setQuery("")}>{item.label}<small>{item.description}</small></Link></li>)}</ul>}</div> : null}
      {notificationsOpen ? <div className="admin-app-notification-panel" role="dialog" aria-label="การแจ้งเตือน"><strong>การแจ้งเตือนที่ต้องติดตาม</strong><p>{notificationCount > 0 ? `มีงานเร่งด่วนหรือใกล้ครบ SLA ${notificationCount} รายการ` : "ยังไม่มีการแจ้งเตือนใหม่"}</p>{supportItem ? <Link href={navHref(supportItem, identity)} onClick={() => setNotificationsOpen(false)}>เปิดคิวงานส่งต่อ</Link> : <span>ไม่มีคิวงานที่ role นี้เข้าถึงได้</span>}</div> : null}
      <div className="admin-app-content">
        <nav aria-label="เส้นทางปัจจุบัน" className="admin-app-breadcrumbs"><Link href={navHref(ADMIN_NAV_ITEMS[0]!, identity)}>ภาพรวม</Link>{breadcrumbs.map((crumb) => <span aria-current={crumb === breadcrumbs[breadcrumbs.length - 1] ? "page" : undefined} key={crumb}> / {crumb}</span>)}</nav>
        {!identity.synthetic ? <div className="admin-app-environment" role="status">หน้านี้รอ server session และ policy จริงก่อนเปิดข้อมูล production</div> : null}
        {children}
      </div>
    </div>
  </div>;
}
