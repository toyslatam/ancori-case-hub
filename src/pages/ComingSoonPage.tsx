export default function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      <p className="mt-2 text-muted-foreground">Esta sección está en preparación.</p>
    </div>
  );
}
