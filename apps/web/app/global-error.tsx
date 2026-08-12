"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="th">
      <body>
        <main className="shell">
          <section className="panel error-panel" role="alert">
            <h1>ระบบขัดข้องชั่วคราว</h1>
            <p className="lede">กรุณาลองใหม่อีกครั้ง</p>
            <button type="button" onClick={() => reset()}>
              ลองอีกครั้ง
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
