import { afterEach, describe, expect, test } from "bun:test";
import { ApiRequestError } from "./api";
import {
  designSystemField,
  fetchDesignSystems,
  isDesignSystemUnavailable,
  parseDesignSystems,
  resolveDesignSystemId,
  type DesignSystemSummary,
} from "./designSystems";

const margin: DesignSystemSummary = {
  id: "margin",
  version: 1,
  name: "Margin",
  summary: "Quiet Swiss minimalism.",
  previews: ["/api/v1/design-systems/margin/1/previews/1.png"],
};
const afterglow: DesignSystemSummary = { ...margin, id: "afterglow", name: "Afterglow" };

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe("parseDesignSystems", () => {
  test("keeps the bare array in the order the API returned it", () => {
    expect(parseDesignSystems([margin, afterglow])).toEqual([margin, afterglow]);
  });

  test("treats anything but an array as empty", () => {
    expect(parseDesignSystems({ data: [margin] })).toEqual([]);
    expect(parseDesignSystems(null)).toEqual([]);
  });

  test("drops entries without an id or name and tolerates missing optional fields", () => {
    expect(parseDesignSystems([{ id: "x" }, null, { id: "plain", name: "Plain" }])).toEqual([
      { id: "plain", version: 0, name: "Plain", summary: "", previews: [] },
    ]);
  });
});

describe("parseDesignSystems colors", () => {
  test("keeps the text, background and accent hexes", () => {
    const colors = { text: "#0a0a0a", background: "#ffffff", accent: "#6e6e6e" };
    expect(parseDesignSystems([{ ...margin, colors }])[0].colors).toEqual(colors);
  });

  test("drops colors when any hex is missing or malformed", () => {
    expect(parseDesignSystems([{ ...margin, colors: { text: "#000", background: "#ffffff", accent: "#6e6e6e" } }])[0])
      .not.toHaveProperty("colors");
    expect(parseDesignSystems([{ ...margin, colors: { text: "#0a0a0a", background: "#ffffff" } }])[0])
      .not.toHaveProperty("colors");
  });
});

describe("resolveDesignSystemId", () => {
  test("preselects the default, which the API lists first", () => {
    expect(resolveDesignSystemId([margin, afterglow])).toBe("margin");
  });

  test("keeps a pick that is still listed and ignores one that is not", () => {
    expect(resolveDesignSystemId([margin, afterglow], "afterglow")).toBe("afterglow");
    expect(resolveDesignSystemId([margin, afterglow], "retired")).toBe("margin");
  });

  test("has no id when the list is empty or failed", () => {
    expect(resolveDesignSystemId([])).toBeUndefined();
  });
});

describe("designSystemField", () => {
  test("carries the id for a DOCUMENT only", () => {
    expect(designSystemField("DOCUMENT", "afterglow")).toEqual({ designSystemId: "afterglow" });
    expect(designSystemField("DOCUMENT", undefined)).toEqual({});
    expect(designSystemField("POST", "afterglow")).toEqual({});
    expect(designSystemField("POLL", "afterglow")).toEqual({});
    expect(designSystemField(undefined, "afterglow")).toEqual({});
  });
});

describe("isDesignSystemUnavailable", () => {
  test("matches the 409 with the design_system.unavailable code", () => {
    expect(isDesignSystemUnavailable(new ApiRequestError("Gone.", 409, "design_system.unavailable"))).toBe(true);
  });

  test("ignores other 409s and other errors", () => {
    expect(isDesignSystemUnavailable(new ApiRequestError("Busy.", 409))).toBe(false);
    expect(isDesignSystemUnavailable(new ApiRequestError("Bad.", 400, "design_system.unavailable"))).toBe(false);
    expect(isDesignSystemUnavailable(new Error("boom"))).toBe(false);
  });
});

describe("fetchDesignSystems", () => {
  test("reads the bare array from GET /design-systems", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify([margin, afterglow]), { status: 200 });
    }) as unknown as typeof fetch;

    expect(await fetchDesignSystems()).toEqual([margin, afterglow]);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toEndWith("/design-systems");
  });

  test("rejects when the list cannot be loaded", async () => {
    globalThis.fetch = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
    await expect(fetchDesignSystems()).rejects.toBeInstanceOf(ApiRequestError);
  });
});
