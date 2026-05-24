import type { ColumnDef } from "@tanstack/react-table";

export type AppTableColumn<TData> = ColumnDef<TData>;

export const tablePageSizeOptions = [10, 25, 50, 100] as const;

export function normalizeTableFilter(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR");
}
