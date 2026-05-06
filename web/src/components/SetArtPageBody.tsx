import type { ReactNode } from "react";
import Link from "next/link";
import SetArtListing from "./SetArtListing";
import type { MtgSet, SetArtPage, SetArtSort } from "@/lib/types";

const SORTS: { key: SetArtSort; label: string }[] = [
  { key: "latest", label: "Latest" },
  { key: "popularity", label: "Popular" },
  { key: "az", label: "A-Z" },
  { key: "price", label: "$" },
];

interface Props {
  apiPath: string;
  basePath: string;
  sort: SetArtSort;
  page: SetArtPage;
  activeSet?: MtgSet;
  headerSlot?: ReactNode;
  heading?: string;
}

export default function SetArtPageBody({
  apiPath,
  basePath,
  sort,
  page,
  activeSet,
  headerSlot,
  heading,
}: Props) {
  function sortHref(s: SetArtSort) {
    const sortQs = s !== "popularity" ? `?sort=${s}` : "";
    return `${basePath}${sortQs}`;
  }

  const sortBar = (
    <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
      {SORTS.map((s) => {
        const isActive = s.key === sort;
        return (
          <Link
            key={s.key}
            href={sortHref(s.key)}
            scroll={false}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isActive
                ? "bg-amber-500/15 text-amber-300"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );

  return (
    <>
      {headerSlot ? (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-6 mb-4">
          <div className="w-full sm:w-1/2 min-w-0">{headerSlot}</div>
          <div className="ml-auto">{sortBar}</div>
        </div>
      ) : activeSet ? (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-6 mb-6 pb-4 border-b border-gray-800">
          <div className="flex items-center gap-3 min-w-0">
            {activeSet.icon_svg_uri && (
              <img src={activeSet.icon_svg_uri} alt="" className="w-6 h-6 invert opacity-80 shrink-0" />
            )}
            <div className="min-w-0">
              <h2 className="text-lg md:text-xl font-bold text-white truncate flex items-center gap-2">
                {activeSet.name}
                {activeSet.is_preview && (
                  <span className="text-[10px] uppercase tracking-wide text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded">
                    Preview
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-500">
                {activeSet.set_code.toUpperCase()}
                {activeSet.released_at && ` · ${activeSet.released_at}`}
                {` · ${page.total} illustration${page.total === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>
          {sortBar}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-6 mb-4">
          {heading ? (
            <h2 className="text-lg md:text-xl font-bold text-white">{heading}</h2>
          ) : (
            <div />
          )}
          {sortBar}
        </div>
      )}

      <SetArtListing
        apiPath={apiPath}
        sort={sort}
        initial={page.illustrations}
        total={page.total}
      />
    </>
  );
}
