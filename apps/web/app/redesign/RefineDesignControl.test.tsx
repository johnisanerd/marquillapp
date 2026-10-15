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
      isOpen
      onToggle={() => {}}
      onReload={() => {}}
      currentDesignName="Schematic"
      unavailableMessage={null}
      {...overrides}
    />,
  );
}

describe("RefineDesignControl", () => {
  test("keeps the current design by default and can switch", () => {
    const chosen: string[] = [];
    const view = renderControl({ onChange: (id) => chosen.push(id) });

    expect(view.getByText("Design: keep current")).toBeTruthy();
    expect((view.getByLabelText(/Keep current design \(Schematic\)/) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(view.getByLabelText(/Afterglow/));
    expect(chosen).toEqual(["afterglow"]);
  });

  test("after a 409 shows the message, drops the keep option and asks for a choice", () => {
    const view = renderControl({ unavailableMessage: message });

    expect(view.getByRole("alert").textContent).toBe(message);
    expect(view.getByText("Choose a design")).toBeTruthy();
    expect(view.queryByLabelText(/Keep current/)).toBeNull();
    expect(view.getAllByRole("radio").map((radio) => (radio as HTMLInputElement).checked)).toEqual([false, false]);
  });

  test("clears the message once a system is chosen", () => {
    const view = renderControl({ unavailableMessage: message, value: "margin" });
    expect(view.queryByRole("alert")).toBeNull();
    expect(view.getByText("Margin", { selector: ".mq-design-trigger span" })).toBeTruthy();
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
    expect(view.queryByRole("radio")).toBeNull();
    expect(view.queryByRole("status")).toBeNull();
  });
});
