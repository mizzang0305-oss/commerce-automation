import "server-only";

export const CALLBACK_DISABLED_MESSAGE = "n8n callback 설정이 없어 결과를 반영할 수 없습니다.";

export function verifyCallbackRequest(request: Request) {
  const secret = process.env.COMMERCE_AUTOMATION_API_SECRET;
  if (!secret) {
    return {
      ok: false as const,
      status: 503,
      message: CALLBACK_DISABLED_MESSAGE
    };
  }

  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${secret}`) {
    return {
      ok: false as const,
      status: 401,
      message: "callback 인증에 실패했습니다."
    };
  }

  return { ok: true as const };
}
