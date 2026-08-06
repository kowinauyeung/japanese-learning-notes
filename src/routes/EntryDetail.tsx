import { useParams } from 'react-router-dom';

export function Component() {
  const { id } = useParams();
  return (
    <section className="rounded-card bg-card p-6 shadow-panel">
      <h1 className="font-display text-2xl font-bold">{id}</h1>
      <p className="text-muted mt-2 text-sm">詳細表示は次のタスクで実装します。</p>
    </section>
  );
}
