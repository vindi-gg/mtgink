"use client";

import { useState } from "react";
import Link from "next/link";

interface Tag {
  tag_id: string;
  slug: string;
  label: string;
}

interface TagListProps {
  title: string;
  tags: Tag[];
  className?: string;
  visibleCount?: number;
}

export default function TagList({ title, tags, className = "", visibleCount = 6 }: TagListProps) {
  const [expanded, setExpanded] = useState(false);
  const showToggle = tags.length > visibleCount;
  const visible = expanded ? tags : tags.slice(0, visibleCount);

  return (
    <div>
      <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2">{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((t) => (
          <Link
            key={t.tag_id}
            href={`/db/tags/${t.slug}`}
            className={`px-2 py-1 text-xs rounded-md hover:bg-gray-700 hover:text-amber-400 transition-colors ${className}`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {showToggle && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
        >
          {expanded ? "Show less" : `Show all ${tags.length} tags`}
        </button>
      )}
    </div>
  );
}
