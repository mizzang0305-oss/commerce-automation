import { handleManualUploadResult, type UploadPackageResultRouteContext } from "../_resultRoute";

export async function POST(request: Request, context: UploadPackageResultRouteContext) {
  return handleManualUploadResult(request, context, "uploaded");
}
