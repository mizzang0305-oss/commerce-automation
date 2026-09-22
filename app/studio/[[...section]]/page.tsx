import { notFound } from "next/navigation";
import { StudioApp } from "@/components/studio/StudioApp";
import { readCommerceStudioModel } from "@/lib/commerce-studio/readModel";
import { isCommerceStudioEnabled } from "@/lib/commerce-studio/featureFlag";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Commerce Studio | 콘텐츠 운영" };

const SECTIONS = ["overview", "calendar", "content", "products", "settings", "connections"] as const;

export default async function StudioPage({ params }: { params: Promise<{ section?: string[] }> }) {
  if (!isCommerceStudioEnabled()) notFound();
  const segments = (await params).section ?? [];
  const section = segments[0] ?? "overview";
  if (!SECTIONS.includes(section as (typeof SECTIONS)[number]) || segments.length > 1) notFound();
  const model = await readCommerceStudioModel();
  return <StudioApp section={section as (typeof SECTIONS)[number]} model={model} />;
}
