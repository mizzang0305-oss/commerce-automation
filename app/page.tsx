import { redirect } from "next/navigation";
import { isCommerceStudioEnabled } from "@/lib/commerce-studio/featureFlag";

export default function HomePage() {
  redirect(isCommerceStudioEnabled() ? "/studio" : "/dashboard");
}
