"use client";

import dynamic from "next/dynamic";

const SearchBar = dynamic(
  () => import("@/components/search/SearchBar").then((m) => m.SearchBar),
  { ssr: false },
);

export function SearchBarClient() {
  return <SearchBar />;
}
