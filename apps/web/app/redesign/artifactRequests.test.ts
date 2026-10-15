import { afterEach, describe, expect, test } from "bun:test";
import { StylePreset } from "../lib/types";
import {
  createArtifactBody,
  createArtifactRequest,
  refineArtifactBody,
  refineArtifactRequest,
} from "./artifactRequests";
import { isDesignSystemUnavailable } from "./designSystems";

const create = {
  prompt: "Ten lessons from shipping",
  withResearch: false,
  stylePreset: StylePreset.PROFESSIONAL,
};

describe("createArtifactBody", () => {
  test("a DOCUMENT with a chosen system sends designSystemId", () => {
    expect(createArtifactBody({ ...create, type: "DOCUMENT", designSystemId: "afterglow" })).toEqual({
      type: "DOCUMENT",
      prompt: create.prompt,
      withResearch: false,
      designSystemId: "afterglow",
    });
  });

  test("a DOCUMENT without a choice (the list failed or is empty) sends none", () => {
    const body = createArtifactBody({ ...create, type: "DOCUMENT" });
    expect(body).toEqual({ type: "DOCUMENT", prompt: create.prompt, withResearch: false });
    expect("designSystemId" in body).toBe(false);
  });

  test("a POST or POLL never carries designSystemId, even if one was picked earlier", () => {
    const post = createArtifactBody({ ...create, type: "POST", designSystemId: "afterglow" });
    const poll = createArtifactBody({ ...create, type: "POLL", designSystemId: "afterglow" });
    expect(post).toEqual({ type: "POST", prompt: create.prompt, withResearch: false, stylePreset: StylePreset.PROFESSIONAL });
    expect(poll).toEqual({ type: "POLL", prompt: create.prompt, withResearch: false });
  });
});

describe("refineArtifactBody", () => {
  test("keeping the design sends no designSystemId", () => {
    expect(refineArtifactBody("DOCUMENT", "Tighten it")).toEqual({ feedback: "Tighten it" });
  });

  test("switching the design sends designSystemId", () => {
    expect(refineArtifactBody("DOCUMENT", "Tighten it", "afterglow")).toEqual({
      feedback: "Tighten it",
      designSystemId: "afterglow",
    });
  });

  test("a POST or POLL refinement never carries designSystemId", () => {
    expect(refineArtifactBody("POST", "Tighten it", "afterglow")).toEqual({ feedback: "Tighten it" });
    expect(refineArtifactBody("POLL", "Tighten it", "afterglow")).toEqual({ feedback: "Tighten it" });
  });
});

describe("requests over the wire", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  function stubFetch(...responses: Response[]) {
    const calls: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      const next = responses.shift();
      if (!next) throw new Error("unexpected request");
      return next;
    }) as unknown as typeof fetch;
    return calls;
  }

  test("posts the create body to /artifacts", async () => {
    const calls = stubFetch(new Response(JSON.stringify({ artifactId: "a1", runId: "r1" }), { status: 202 }));
    const body = createArtifactBody({ ...create, type: "DOCUMENT", designSystemId: "afterglow" });
    expect(await createArtifactRequest(body)).toEqual({ artifactId: "a1", runId: "r1" });
    expect(calls[0].url).toEndWith("/artifacts");
    expect(calls[0].body).toEqual(body);
  });

  test("recovers from 409 design_system.unavailable by retrying with a designSystemId", async () => {
    const message = "The Schematic design is no longer available. Refine with another design.";
    const calls = stubFetch(
      new Response(JSON.stringify({
        statusCode: 409,
        code: "design_system.unavailable",
        message,
        designSystemId: "schematic",
      }), { status: 409 }),
      new Response(JSON.stringify({ artifactId: "a1", version: 2, runId: "r2" }), { status: 202 }),
    );

    const first = await refineArtifactRequest("a1", refineArtifactBody("DOCUMENT", "Tighten it")).catch((reason) => reason);
    expect(isDesignSystemUnavailable(first)).toBe(true);
    expect(first.message).toBe(message);
    expect(calls[0].url).toEndWith("/artifacts/a1/refine");
    expect(calls[0].body).toEqual({ feedback: "Tighten it" });

    const retry = await refineArtifactRequest("a1", refineArtifactBody("DOCUMENT", "Tighten it", "margin"));
    expect(retry).toEqual({ artifactId: "a1", version: 2, runId: "r2" });
    expect(calls[1].body).toEqual({ feedback: "Tighten it", designSystemId: "margin" });
  });

  test("a different 409 is not the design-system recovery path", async () => {
    stubFetch(new Response(JSON.stringify({ statusCode: 409, message: "A refinement is already running." }), { status: 409 }));
    const reason = await refineArtifactRequest("a1", refineArtifactBody("DOCUMENT", "Tighten it")).catch((error) => error);
    expect(isDesignSystemUnavailable(reason)).toBe(false);
    expect(reason.message).toBe("A refinement is already running.");
  });
});
