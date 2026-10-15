import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import type { DesignSystemSummary } from "./designSystems";
import type { DesignSystemsState } from "./useDesignSystems";

const { default: RefineDesignControl } = await import("./RefineDesignControl");

GlobalRegistrator.register();
afterEach(cleanup);
afterAll(() => GlobalRegistrator.unregister());

const systems: DesignSystemSummary[] = [
  { id: "margin", version: 1, name: "Margin", summary: "Quiet.", previews: [] },
  { id: "afterglow", version: 1, name: "Afterglow", summary: "Warm.", previews: [] },
];
const ready: DesignSystemsState = { status: "ready", systems };
const message = "The Schematic design is no longer available. Refine with another design.";

function renderControl(overrides: Partial<Parameters<typeof RefineDesignControl>[0]> = {}) {
  return render(
    <RefineDesignControl
      state={ready}
      systems={systems}
      value=""
      onChange={() => {}}
      onReload={() => {}}
      currentDesignName="Schematic"
      unavailableMessage={null}
      {...overrides}
    />,
  );
}

const openMenu = (view: ReturnType<typeof renderControl>) =>
  fireEvent.click(view.getByRole("button", { name: /Design: keep current|Choose a design|Margin|Afterglow/ }), { detail: 1 });

describe("RefineDesignControl", () => {
  test("keeps the current design by default and can switch", () => {
    const chosen: string[] = [];
    const view = renderControl({ onChange: (id) => chosen.push(id) });

    expect(view.getByText("Design: keep current")).toBeTruthy();
    openMenu(view);
    const keep = view.getByRole("menuitemradio", { name: "Keep current design (Schematic)" });
    expect(keep.getAttribute("aria-checked")).toBe("true");
    expect(view.queryByText(/Create your own/)).toBeNull();
    fireEvent.click(view.getByRole("menuitemradio", { name: "Afterglow" }));
    expect(chosen).toEqual(["afterglow"]);
  });

  test("after a 409 shows the message, drops the keep option and asks for a choice", () => {
    const view = renderControl({ unavailableMessage: message });

    expect(view.getByRole("alert").textContent).toBe(message);
    expect(view.getByText("Choose a design")).toBeTruthy();
    openMenu(view);
    expect(view.queryByText(/Keep current/)).toBeNull();
    expect(view.getAllByRole("menuitemradio").map((item) => item.getAttribute("aria-checked"))).toEqual(["false", "false"]);
  });

  test("previews the hovered design beside the menu", () => {
    const view = renderControl({
      systems: [{ ...systems[0], previews: ["/api/v1/design-systems/margin/1/previews/1.png"] }, systems[1]],
    });
    openMenu(view);

    fireEvent.mouseEnter(view.getByRole("menuitemradio", { name: "Margin" }));

    const card = view.getByRole("tooltip");
    expect(card.textContent).toContain("Quiet.");
    expect(card.querySelector("img")?.getAttribute("src")).toBe("/api/v1/design-systems/margin/1/previews/1.png");
  });

  test("clears the message once a system is chosen", () => {
    const view = renderControl({ unavailableMessage: message, value: "margin" });
    expect(view.queryByRole("alert")).toBeNull();
    expect(view.getByText("Margin", { selector: ".mq-design-trigger-name" })).toBeTruthy();
  });

  test("offers a retry when the 409 meets a list that failed to load", () => {
    let reloads = 0;
    const view = renderControl({
      state: { status: "failed" },
      systems: [],
      unavailableMessage: message,
      onReload: () => { reloads += 1; },
    });

    expect(view.getByText(/could not be loaded/)).toBeTruthy();
    fireEvent.click(view.getByText("Try again"));
    expect(reloads).toBe(1);
  });

  test("says so when the list is empty instead of claiming a load failure", () => {
    const view = renderControl({ state: { status: "ready", systems: [] }, systems: [], unavailableMessage: message });
    expect(view.getByText("No designs are available right now.")).toBeTruthy();
    expect(view.queryByText("Try again")).toBeNull();
  });

  test("shows nothing extra when the list fails and nothing is required", () => {
    const view = renderControl({ state: { status: "failed" }, systems: [] });
    expect(view.queryByRole("button")).toBeNull();
    expect(view.queryByRole("status")).toBeNull();
  });
});
