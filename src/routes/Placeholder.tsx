/**
 * The two Phase 2 destinations still to be built. They exist so the nav from
 * the handoff is complete and no link dead-ends on a 404. Practice is no longer
 * among them — see `routes/Practice.tsx`.
 */
function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <section className="rounded-card bg-card p-8 text-center shadow-panel">
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted">{note}</p>
    </section>
  );
}

export function WordSets() {
  return <Placeholder title="単語集" note="単語集は次のフェーズで実装します。" />;
}

export function History() {
  return <Placeholder title="履歴" note="練習履歴は次のフェーズで実装します。" />;
}
