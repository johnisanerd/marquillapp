import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { ArtifactType } from "./artifactTypes";
import { API_BASE } from "./api";
import { FakeEventSource, installFakeEventSource } from "./fakeEventSource";
import { useArtifactRun } from "./useArtifactRun";

GlobalRegistrator.register();
let restoreEventSource: () => void = () => {};
beforeAll(() => { restoreEventSource = installFakeEventSource(); });
beforeEach(() => FakeEventSource.reset());
afterEach(cleanup);
afterAll(() => {
  restoreEventSource();
  GlobalRegistrator.unregister();
});

type Options = Parameters<typeof useArtifactRun>[0];

/** Renders `useArtifactRun` with recording callbacks; override any option. */
function renderArtifactRun(overrides: Partial<Options> = {}) {
  const types: ArtifactType[] = [];
  const ready: Array<{ version: number; credits: number }> = [];
  let terminalFailures = 0;
  const options: Options = {
    runId: "run-1",
    enabled: true,
    onType: (type) => { types.push(type); },
    onArtifactReady: async (version, credits) => { ready.push({ version, credits }); },
    onTerminalFailure: () => { terminalFailures += 1; },
    ...overrides,
  };
  const hook = renderHook((props: Options) => useArtifactRun(props), { initialProps: options });
  return {
    hook,
    /** Re-renders with these options changed from the initial ones. */
    rerender: (changes: Partial<Options>) => hook.rerender({ ...options, ...changes }),
    types,
    ready,
    get terminalFailures() { return terminalFailures; },
    stream: () => FakeEventSource.latest(),
  };
}

const started = { seq: 1, ts: 1, kind: "INITIAL", type: "POST", steps: ["RESEARCH", "GENERATE"] };

describe("useArtifactRun", () => {
  test("opens the run stream on first render when a run id is present", () => {
    const { hook } = renderArtifactRun();

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.latest()?.url).toBe(`${API_BASE}/runs/run-1/events`);
    expect(FakeEventSource.latest()?.withCredentials).toBe(true);
    expect(hook.result.current.run?.status).toBe("connecting");
  });

  test("opens nothing without a run id", () => {
    const { hook } = renderArtifactRun({ runId: undefined });

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(hook.result.current.run).toBeNull();
  });

  test("opens nothing while disabled", () => {
    renderArtifactRun({ enabled: false });

    expect(FakeEventSource.instances).toHaveLength(0);
  });

  test("tracks steps and credits from progress events, ignoring stale ones", () => {
    const harness = renderArtifactRun();
    const stream = harness.stream()!;

    act(() => {
      stream.open();
      stream.emit("run.started", started);
      stream.emit("step.started", { seq: 2, ts: 2, step: "RESEARCH", index: 0, total: 2 });
      stream.emit("step.progress", { seq: 3, ts: 3, step: "RESEARCH", sourcesFound: 4 });
      stream.emit("usage.tick", { seq: 4, ts: 4, kind: "llm", credits: 2, totalCredits: 2 });
      stream.emit("step.completed", { seq: 5, ts: 5, step: "RESEARCH", index: 0, total: 2 });
      // A replayed event (seq not above the last one) is dropped.
      stream.emit("step.started", { seq: 5, ts: 6, step: "GENERATE", index: 1, total: 2 });
    });

    const run = harness.hook.result.current.run;
    expect(harness.types).toEqual(["POST"]);
    expect(run?.status).toBe("running");
    expect(run?.sourcesFound).toBe(4);
    expect(run?.credits).toBe(2);
    expect(run?.steps).toEqual([
      { step: "RESEARCH", status: "completed", message: undefined },
      { step: "GENERATE", status: "pending" },
    ]);
  });

  test("shows reconnecting when the connection drops mid-run", () => {
    const harness = renderArtifactRun();

    act(() => {
      harness.stream()!.open();
      harness.stream()!.fail();
    });

    expect(harness.hook.result.current.run?.status).toBe("reconnecting");
  });

  test("closes the stream and loads the version on run.completed", async () => {
    const harness = renderArtifactRun();
    const stream = harness.stream()!;

    await act(async () => {
      stream.emit("run.started", started);
      stream.emit("usage.tick", { seq: 2, ts: 2, kind: "llm", credits: 3, totalCredits: 3 });
      stream.emit("run.completed", { seq: 3, ts: 3, artifactId: "artifact-1", version: 1 });
    });

    expect(stream.closed).toBe(true);
    expect(harness.ready).toEqual([{ version: 1, credits: 3 }]);
    expect(harness.hook.result.current.run).toBeNull();
  });

  test("closes the stream and reports the failure on run.failed", () => {
    const harness = renderArtifactRun();
    const stream = harness.stream()!;

    act(() => {
      stream.emit("run.started", started);
      stream.emit("run.failed", { seq: 2, ts: 2, code: "internal", failureReason: "Boom." });
    });

    const run = harness.hook.result.current.run;
    expect(stream.closed).toBe(true);
    expect(harness.terminalFailures).toBe(1);
    expect(run?.status).toBe("failed");
    expect(run?.failureReason).toBe("Boom.");
    expect(run?.failureAction).toBe("retry-create");
  });

  test("closes the stream when the run id is cleared", () => {
    const harness = renderArtifactRun();
    const stream = harness.stream()!;

    harness.rerender({ runId: undefined });

    expect(stream.closed).toBe(true);
  });
});
