import { CandidateAnalyticsDashboard } from "@/components/CandidateAnalyticsDashboard";
import { buildCandidateAnalytics } from "@/lib/candidates/candidateAnalytics";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export default async function CandidateAnalyticsPage() {
  const analytics = await buildCandidateAnalytics(getAutomationRepository());
  return <CandidateAnalyticsDashboard analytics={analytics} />;
}
