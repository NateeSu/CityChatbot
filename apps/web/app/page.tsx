import { parsePublicEnv } from "@citychatbot/config/env";

import { ThemeToggle } from "./ui/theme-toggle";

export default function HomePage() {
  const env = parsePublicEnv();

  return (
    <main className="shell">
      <section className="panel" aria-labelledby="page-title">
        <ThemeToggle className="home-theme-control" />
        <p className="eyebrow">MVP foundation</p>
        <h1 id="page-title">ระบบ CityChatbot พร้อมเริ่มพัฒนา</h1>
        <p className="lede">
          แอป production foundation ทำงานด้วย strict TypeScript, ตรวจสอบ environment
          แบบ fail-fast และยังไม่มีการเชื่อมข้อมูลประชาชนหรือ provider จริง
        </p>
        <dl className="status" aria-label="สถานะระบบ">
          <div>
            <dt>Environment</dt>
            <dd>{env.NEXT_PUBLIC_APP_ENV}</dd>
          </div>
          <div>
            <dt>Data mode</dt>
            <dd>ข้อมูลสังเคราะห์เท่านั้น</dd>
          </div>
          <div>
            <dt>Health endpoint</dt>
            <dd>/api/health</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
