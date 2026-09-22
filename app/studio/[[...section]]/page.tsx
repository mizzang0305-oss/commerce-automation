import { notFound } from "next/navigation";
import { StudioApp } from "@/components/studio/StudioApp";
import { isCommerceStudioEnabled } from "@/lib/commerce-studio/featureFlag";
import { studioAuthConfig } from "@/lib/commerce-studio/auth/config";
import { readStudioOwner } from "@/lib/commerce-studio/auth/server";
import { emptyStudioModel } from "@/lib/commerce-studio/model";
import { createStudioServerBridge } from "@/lib/commerce-studio/bridge/serverStore";
import { studioModelFromSnapshot } from "@/lib/commerce-studio/bridge/snapshotModel";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Commerce Studio | 콘텐츠 운영" };

const SECTIONS = ["overview", "calendar", "content", "products", "settings", "connections"] as const;

export default async function StudioPage({ params }: { params: Promise<{ section?: string[] }> }) {
  if (!isCommerceStudioEnabled()) notFound();
  const segments = (await params).section ?? [];
  const section = segments[0] ?? "overview";
  if (!SECTIONS.includes(section as (typeof SECTIONS)[number]) || segments.length > 1) notFound();
  const configured = studioAuthConfig().ready;
  const owner = configured ? await readStudioOwner() : null;
  if (configured && !owner) redirect("/studio/login");
  const server = owner ? createStudioServerBridge() : null;
  const model = owner && server && owner.ownerId === server.binding.ownerId
    ? studioModelFromSnapshot(await server.bridge.read(owner.ownerId), new Date(), process.env.STUDIO_COMMANDS_ENABLED === "true")
    : emptyStudioModel();
  return <StudioApp section={section as (typeof SECTIONS)[number]} model={model} authSetupRequired={!configured} />;
}
