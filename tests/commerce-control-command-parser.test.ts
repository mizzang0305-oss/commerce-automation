import { describe, expect, test } from "vitest";
import { parseOwnerCommand } from "@/lib/commerce-control/commandParser";

describe("owner command parser", () => {
  test.each([
    ["이 영상 목소리를 조금 빠르게 다시 만들어", "음성재생성"],
    ["첫 문구를 더 강하게 바꿔", "메타데이터수정"],
    ["이 상품은 제외해", "제외"],
    ["이 상품 검토 PASS", "검토PASS"]
  ])("maps allowlisted Korean input", (input, command) => {
    expect(parseOwnerCommand(input)).toMatchObject({ command });
  });

  test("rejects ambiguous input without execution", () => {
    expect(parseOwnerCommand("알아서 해줘")).toEqual({ error: "명령을 이해하지 못했습니다. 버튼을 선택하거나 요청을 구체적으로 입력하세요." });
  });
});
