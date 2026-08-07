/**
 * Phase 2 destinations. They exist now so the nav from the handoff is complete
 * and no link dead-ends on a 404 while the practice features are built.
 */
function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <section className="rounded-card bg-card p-8 text-center shadow-panel">
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted">{note}</p>
    </section>
  );
}

export function Flashcards() {
  return <Placeholder title="フラッシュカード" note="練習機能は次のフェーズで実装します。" />;
}

export function Dictation() {
  return <Placeholder title="書き取り練習" note="練習機能は次のフェーズで実装します。" />;
}

export function WordSets() {
  return <Placeholder title="単語集" note="単語集は次のフェーズで実装します。" />;
}

export function History() {
  return <Placeholder title="履歴" note="練習履歴は次のフェーズで実装します。" />;
}
