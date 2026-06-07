import Link from "next/link";
import { siteConfig } from "@/content/config";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <p className="text-6xl font-bold text-white/10">404</p>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-white/80">Page not found</h1>
        <p className="text-sm text-white/40">
          This item may have been removed or the link is incorrect.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2 text-sm text-white/60 transition-colors hover:border-white/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      >
        ← Back to {siteConfig.name}
      </Link>
    </main>
  );
}
