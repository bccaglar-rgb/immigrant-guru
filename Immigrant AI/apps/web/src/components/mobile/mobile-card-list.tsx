"use client";

import type { ReactNode } from "react";

type MobileCardListProps<T> = Readonly<{
  className?: string;
  emptyState?: ReactNode;
  items: T[];
  renderItem: (item: T) => ReactNode;
}>;

export function MobileCardList<T>({
  className,
  emptyState,
  items,
  renderItem
}: MobileCardListProps<T>) {
  if (items.length === 0) {
    return emptyState ?? null;
  }

  return (
    <div className={className ?? "space-y-3"}>
      {items.map((item, index) => (
        <div key={index}>{renderItem(item)}</div>
      ))}
    </div>
  );
}
