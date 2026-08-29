export default function ForbiddenPage() {
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <section className="max-w-lg text-center space-y-3">
        <h1 className="text-3xl font-semibold">Access forbidden</h1>
        <p className="text-muted-foreground">
          You do not have access to this tenant, or this store is currently
          unavailable.
        </p>
      </section>
    </main>
  );
}
