import { requireCommerceControlPageAuth } from "@/lib/commerce-control/auth";
import { getCommerceControlRepository } from "@/lib/google-sheets/commerceControlRepository";
import { CommerceControlPage, CommerceControlUnavailable } from "@/components/commerce-control/CommerceControlNav";
import { SettingsEditor } from "@/components/commerce-control/SettingsEditor";

export const dynamic = "force-dynamic";

export default async function CommerceSettingsPage() {
  await requireCommerceControlPageAuth();
  let settings; try { settings = await getCommerceControlRepository().settings.list(); } catch { settings = null; }
  return <CommerceControlPage title="운영 설정" description="자동 업로드는 OFF로 고정하며 Google Sheet 설정 탭의 허용된 값만 수정합니다.">{settings ? <SettingsEditor settings={settings} /> : <CommerceControlUnavailable />}</CommerceControlPage>;
}
