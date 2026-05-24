"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useChartContainerWidth } from "@/components/charts/useChartContainerWidth";

type ChartDatum = {
  label: string;
  value: number;
};

export function WorkerJobStatusChart({ data }: { data: ChartDatum[] }) {
  const { ref, width } = useChartContainerWidth<HTMLDivElement>();

  return (
    <div ref={ref} className="h-64 min-w-0 w-full">
      {width > 0 ? (
        <ResponsiveContainer width={width} height={240}>
          <BarChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={0} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => [`${value}개`, "작업 수"]} />
            <Bar dataKey="value" fill="#0f766e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
