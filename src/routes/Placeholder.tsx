/**
 * The one Phase 2 destination still to be built. It exists so the nav from the
 * handoff is complete and no link dead-ends on a 404. Practice and 単語集 are no
 * longer among them — see `routes/Practice.tsx` and `routes/WordSets.tsx`.
 */
function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <section className="rounded-card bg-card p-8 text-center shadow-panel">
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted">{note}</p>
    </section>
  );
}

export function History() {
  return <Placeholder title="履歴" note="練習履歴は次のフェーズで実装します。" />;
}
