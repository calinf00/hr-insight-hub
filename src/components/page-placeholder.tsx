interface Props {
  title: string;
  description?: string;
}

export function PagePlaceholder({ title, description }: Props) {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && (
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="rounded-lg border border-dashed border-border bg-card/50 p-16 text-center">
        <p className="text-sm text-muted-foreground">Contenuto in arrivo</p>
      </div>
    </div>
  );
}
