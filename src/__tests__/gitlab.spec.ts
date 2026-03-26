import { describe, expect, vi, test } from "vitest";
import { handleGitlabWebhook } from "../gitlabHandler";
import type { LarkRobot } from "../lark/robot";
import note from "./fixtures/note.json";
import mergeRequest from "./fixtures/merge_request.json";
import pipeline from "./fixtures/pipeline.json";
import push from "./fixtures/push.json";

const createMockRobot = () => {
  const robot: LarkRobot = {
    send: vi.fn(() => Promise.resolve({ code: 0, msg: "" })),
  };
  return robot;
};

describe("gitlab", () => {
  test("note event should send card", async () => {
    const robot = createMockRobot();
    await handleGitlabWebhook(note as any, robot);
    expect(robot.send).toBeCalledTimes(1);
    expect((robot.send as any).mock.calls[0]).toMatchSnapshot();
  });

  test("merge_request event should send card", async () => {
    const robot = createMockRobot();
    await handleGitlabWebhook(mergeRequest as any, robot);
    expect(robot.send).toBeCalledTimes(1);
    expect((robot.send as any).mock.calls[0]).toMatchSnapshot();
  });

  test("pipeline event should send card", async () => {
    const robot = createMockRobot();
    await handleGitlabWebhook(pipeline as any, robot);
    expect(robot.send).toBeCalledTimes(1);
    expect((robot.send as any).mock.calls[0]).toMatchSnapshot();
  });

  test("push event should send card", async () => {
    const robot = createMockRobot();
    await handleGitlabWebhook(push as any, robot);
    expect(robot.send).toBeCalledTimes(1);
    expect((robot.send as any).mock.calls[0]).toMatchSnapshot();
  });

  test("unknown event should not send", async () => {
    const robot = createMockRobot();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await handleGitlabWebhook({ object_kind: "unknown" } as any, robot);
    expect(robot.send).not.toBeCalled();
    consoleSpy.mockRestore();
  });
});
