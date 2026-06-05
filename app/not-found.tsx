import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <h1>404 – Page not found</h1>
      <Link href="/">Return home</Link>
    </main>
  );
}
