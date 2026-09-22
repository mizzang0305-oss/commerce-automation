import { describe, expect, it } from "vitest";
import { classifyHookFamily, detectRepeatedHookFamilies } from "../../../src/lib/video-automation/qa/hookDiversity";

describe("hook diversity gate", () => {
  it("classifies supported families", () => {
    expect(classifyHookFamily("케이블, 왜 3가지를 확인할까요?")).toBe("CHECKLIST");
    expect(classifyHookFamily("수납 공간을 한 번에 정리!")).toBe("SPACE");
    expect(classifyHookFamily("컵홀더 정리, 왜 불편할까요?")).toBe("QUESTION");
  });

  it("detects a repeated batch template family", () => {
    expect(detectRepeatedHookFamilies(["왜 불편할까요?", "왜 자꾸 복잡할까요?", "이 3가지만 확인하세요"])).toEqual(["QUESTION"]);
  });
});
