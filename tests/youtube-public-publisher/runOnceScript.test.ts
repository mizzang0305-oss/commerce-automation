import { describe, expect, test } from "vitest";
import { publisherRunExitCode } from "../../scripts/youtube-public-publisher/run-once";

describe("youtube public publisher run-once script", () => {
  test("treats an empty ready queue as a safe successful activation", () => {
    expect(publisherRunExitCode({ status: "no_ready_job" })).toBe(0);
  });
});
