import type { AllowedCommand } from "@/lib/google-sheets/sheetSchemas";

export type ParsedOwnerCommand = { command: AllowedCommand; requestValue?: string } | { error: string };

export function parseOwnerCommand(input: string): ParsedOwnerCommand {
  const text = input.trim();
  if (!text) return { error: "명령을 이해하지 못했습니다. 버튼을 선택하거나 요청을 구체적으로 입력하세요." };
  if (/검토\s*pass|검토.*통과/i.test(text)) return { command: "검토PASS" };
  if (/검토\s*fail|검토.*실패/i.test(text)) return { command: "검토FAIL" };
  if (/제외/.test(text)) return { command: "제외" };
  if (/보류/.test(text)) return { command: "보류" };
  if (/음성|목소리/.test(text) && /다시|재생성|빠르/.test(text)) return { command: "음성재생성", requestValue: text };
  if (/영상/.test(text) && /다시|재생성/.test(text)) return { command: "영상재생성", requestValue: text };
  if (/전체/.test(text) && /재시도|다시/.test(text)) return { command: "전체재시도", requestValue: text };
  if (/첫\s*문구|후킹|제목|설명/.test(text) && /바꿔|수정|강하게/.test(text)) {
    return { command: "메타데이터수정", requestValue: JSON.stringify({ instruction: text }) };
  }
  return { error: "명령을 이해하지 못했습니다. 버튼을 선택하거나 요청을 구체적으로 입력하세요." };
}
