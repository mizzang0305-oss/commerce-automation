import { buildYouTubeSourceSnapshot, normalizeTranscript } from "./source";
import type { TranscriptSegmentInput, YouTubeFixtureInput } from "./types";

interface FixtureDefinition {
  id: string;
  channelId: string;
  title: string;
  segments: TranscriptSegmentInput[];
}

const DEFINITIONS: readonly FixtureDefinition[] = [
  { id: "YTCI0000001", channelId: "synthetic-channel-a", title: "Question hook organizer", segments: [{ startSeconds: 0, durationSeconds: 2, text: "왜 작은 공간은 늘 정리가 어려울까요?" }, { startSeconds: 4, durationSeconds: 3, text: "문제는 자주 쓰는 물건의 자리가 없다는 점입니다." }, { startSeconds: 12, durationSeconds: 4, text: "직접 수납 구조를 바꾸는 과정을 보여드릴게요." }, { startSeconds: 28, durationSeconds: 3, text: "지금 체크리스트를 확인해 보세요." }] },
  { id: "YTCI0000002", channelId: "synthetic-channel-b", title: "Problem hook cleaning", segments: [{ startSeconds: 0.5, durationSeconds: 2, text: "청소 시간이 너무 오래 걸리는 문제가 있죠." }, { startSeconds: 5, durationSeconds: 3, text: "핵심은 동선을 한 번만 만드는 것입니다." }, { startSeconds: 22, durationSeconds: 3, text: "이 방식은 시간을 절약하는 장점이 있습니다." }] },
  { id: "YTCI0000003", channelId: "synthetic-channel-c", title: "Benefit hook kitchen", segments: [{ startSeconds: 0, durationSeconds: 2, text: "이 방법이면 주방 준비를 더 빠르게 끝낼 수 있습니다." }, { startSeconds: 8, durationSeconds: 3, text: "먼저 자주 쓰는 도구를 가까이 둡니다." }, { startSeconds: 32, durationSeconds: 3, text: "링크의 순서를 확인해 직접 적용해 보세요." }] },
  { id: "YTCI0000004", channelId: "synthetic-channel-a", title: "Warning hook laundry", segments: [{ startSeconds: 0, durationSeconds: 2, text: "주의, 이 세탁 실수는 절대 반복하면 안 됩니다." }, { startSeconds: 6, durationSeconds: 3, text: "원단별로 온도를 나누는 것이 핵심입니다." }, { startSeconds: 25, durationSeconds: 4, text: "비교 결과 형태 유지가 더 잘됐습니다." }] },
  { id: "YTCI0000005", channelId: "synthetic-channel-b", title: "List hook desk", segments: [{ startSeconds: 0, durationSeconds: 3, text: "책상을 정리하는 3가지 단계를 알려드릴게요." }, { startSeconds: 7, durationSeconds: 3, text: "첫 단계는 사용 빈도로 구역을 나누는 것입니다." }, { startSeconds: 18, durationSeconds: 3, text: "직접 배치 전후를 비교해 봅니다." }] },
  { id: "YTCI0000006", channelId: "synthetic-channel-c", title: "Before after bathroom", segments: [{ startSeconds: 0, durationSeconds: 2, text: "정리 전후 차이를 먼저 보세요." }, { startSeconds: 5, durationSeconds: 3, text: "불편했던 병목은 젖은 물건의 위치였습니다." }, { startSeconds: 20, durationSeconds: 3, text: "결과는 바닥 공간이 더 넓어진 것입니다." }] },
  { id: "YTCI0000007", channelId: "synthetic-channel-d", title: "Demonstration hook storage", segments: [{ startSeconds: 0, durationSeconds: 2, text: "직접 접이식 수납을 테스트해 보겠습니다." }, { startSeconds: 9, durationSeconds: 3, text: "사용하지 않을 때는 폭을 줄일 수 있습니다." }, { startSeconds: 35, durationSeconds: 3, text: "지금 크기를 확인하고 비교해 보세요." }] },
  { id: "YTCI0000008", channelId: "synthetic-channel-d", title: "Weak context no cta", segments: [{ startSeconds: 0, durationSeconds: 3, text: "오늘은 생활 공간에 관한 이야기를 합니다." }, { startSeconds: 11, durationSeconds: 4, text: "일상에서 물건은 사용 흐름에 따라 이동합니다." }, { startSeconds: 28, durationSeconds: 3, text: "정리 기준을 기록하면 변화가 보입니다." }] },
  { id: "YTCI0000009", channelId: "synthetic-channel-e", title: "Early cta curiosity", segments: [{ startSeconds: 0, durationSeconds: 2, text: "놀라운 정리 비밀이 궁금한가요?" }, { startSeconds: 2.5, durationSeconds: 2, text: "지금 순서표를 확인해 보세요." }, { startSeconds: 15, durationSeconds: 3, text: "핵심은 같은 행동을 묶는 것입니다." }] },
  { id: "YTCI0000010", channelId: "synthetic-channel-e", title: "Late cta proof", segments: [{ startSeconds: 0, durationSeconds: 3, text: "작은 습관이 정말 시간을 절약할까요?" }, { startSeconds: 10, durationSeconds: 3, text: "일주일 동안 직접 테스트했습니다." }, { startSeconds: 26, durationSeconds: 4, text: "비교 수치로 개선 결과를 확인했습니다." }, { startSeconds: 58, durationSeconds: 2, text: "마지막으로 링크를 클릭해 목록을 확인하세요." }] },
];

export function buildSyntheticYouTubeFixtures(): YouTubeFixtureInput[] {
  return DEFINITIONS.map((definition, index) => {
    const observedAt = `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`;
    const snapshot = buildYouTubeSourceSnapshot({
      sourceId: `synthetic-source-${index + 1}`,
      url: `https://www.youtube.com/watch?v=${definition.id}`,
      title: definition.title,
      channelId: definition.channelId,
      channelTitle: definition.channelId,
      observedAt,
      durationSeconds: 60,
      transcriptAvailable: true,
      metadataAvailable: true,
      provenanceRepository: "synthetic_fixture",
    });
    return {
      snapshot,
      transcript: normalizeTranscript(snapshot, definition.segments),
    };
  });
}
