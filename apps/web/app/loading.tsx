export default function Loading() {
  return (
    <main className="shell" aria-busy="true" aria-live="polite">
      <section className="panel">
        <p className="eyebrow">กำลังโหลด</p>
        <h1>กำลังเตรียมระบบ</h1>
      </section>
    </main>
  );
}
