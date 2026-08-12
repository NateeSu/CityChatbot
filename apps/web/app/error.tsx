"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="shell">
      <section className="panel error-panel" role="alert" aria-labelledby="error-title">
        <p className="eyebrow">เกิดข้อผิดพลาด</p>
        <h1 id="error-title">ระบบไม่สามารถแสดงหน้านี้ได้</h1>
        <p className="lede">ลองโหลดใหม่อีกครั้ง หากยังไม่สำเร็จให้ส่งต่อทีมดูแลระบบ</p>
        <button type="button" onClick={() => reset()}>
          ลองอีกครั้ง
        </button>
      </section>
    </main>
  );
}
