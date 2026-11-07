import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <h1 className="font-heading text-4xl">That page is not here</h1>
      <Link href="/" className="text-sm underline">
        Back home
      </Link>
    </main>
  );
}
