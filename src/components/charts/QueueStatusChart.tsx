"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useChartContainerWidth } from "@/components/charts/useChartContainerWidth";

type ChartDatum = {
  label: string;
  value: number;
};

const colors = ["#0f766e", "#2563eb", "#ca8a04", "#dc2626", "#7c3aed", "#475569", "#059669"];

export function QueueStatusChart({ data }: { data: ChartDatum[] }) {
  const { ref, width } = useChartContainerWidth<HTMLDivElement>();
  const visibleData = data.filter((entry) => entry.value > 0);
  const chartData = visibleData.length > 0 ? visibleData : [{ label: "데이터 없음", value: 1 }];

  return (
    <div ref={ref} className="h-64 min-w-0 w-full">
      {width > 0 ? (
        <ResponsiveContainer width={width} height={240}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="label"
              innerRadius={58}
              outerRadius={92}
              paddingAngle={2}
            >
              {chartData.map((entry, index) => (
                <Cell key={entry.label} fill={visibleData.length > 0 ? colors[index % colors.length] : "#cbd5e1"} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => [`${value}개`, "상품 수"]} />
          </PieChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
