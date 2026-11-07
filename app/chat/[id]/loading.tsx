export default function ConversationLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-5 py-3">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-3 w-24 animate-pulse rounded bg-muted" />
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6">
        <div className="ml-auto h-10 w-2/3 animate-pulse rounded-2xl bg-muted" />
        <div className="h-24 w-3/4 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
