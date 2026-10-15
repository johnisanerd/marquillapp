import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, fireEvent, render, type RenderResult } from "@testing-library/react";
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import type { DesignSystemSummary } from "./designSystems";

const { default: DesignSystemMenu, KEEP_DESIGN_SYSTEM } = await import("./DesignSystemMenu");

GlobalRegistrator.register();
afterEach(cleanup);
afterAll(() => GlobalRegistrator.unregister());

const systems: DesignSystemSummary[] = [
  {
    id: "margin",
    version: 1,
    name: "Margin",
    summary: "Quiet Swiss minimalism.",
    previews: [
      "/api/v1/design-systems/margin/1/previews/1.png",
      "/api/v1/design-systems/margin/1/previews/2.png",
    ],
  },
  {
    id: "afterglow",
    version: 2,
    name: "Afterglow",
    summary: "Warm gradients on dark.",
    previews: ["/api/v1/design-systems/afterglow/2/previews/1.png"],
  },
  { id: "schematic", version: 1, name: "Schematic", summary: "", previews: [] },
];

function renderMenu(overrides: Partial<Parameters<typeof DesignSystemMenu>[0]> = {}) {
  const chosen: string[] = [];
  const view = render(
    <DesignSystemMenu
      systems={systems}
      value="margin"
      onChange={(id) => chosen.push(id)}
      triggerLabel="Margin"
      triggerAriaLabel="Design: Margin"
      createOwn
      {...overrides}
    />,
  );
  return { view, chosen };
}

const trigger = (view: RenderResult) => view.getByRole("button", { name: "Design: Margin" });
const row = (view: RenderResult, name: string) => view.getByRole("menuitemradio", { name });
const preview = (view: RenderResult) => view.queryByRole("tooltip");

function open(view: RenderResult) {
  fireEvent.click(trigger(view), { detail: 1 });
}

describe("DesignSystemMenu", () => {
  test("shows a swatch pill named for the selected design and starts closed", () => {
    const { view } = renderMenu();

    expect(trigger(view).getAttribute("aria-expanded")).toBe("false");
    expect(trigger(view).querySelector(".mq-design-swatch img")?.getAttribute("src"))
      .toBe("/api/v1/design-systems/margin/1/previews/1.png");
    expect(view.queryByRole("menu")).toBeNull();
  });

  test("lists the systems in API order under a section header, marking the selected one", () => {
    const { view } = renderMenu({ value: "afterglow" });
    open(view);

    expect(view.getByText("Marquill designs")).toBeTruthy();
    const rows = view.getAllByRole("menuitemradio");
    expect(rows.map((item) => item.textContent)).toEqual(["Margin", "Afterglow", "Schematic"]);
    expect(rows.map((item) => item.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(rows[0].querySelector(".mq-design-swatch img")?.getAttribute("src"))
      .toBe("/api/v1/design-systems/margin/1/previews/1.png");
  });

  test("offers a disabled 'Create your own design system' that cannot be selected or focused", () => {
    const { view, chosen } = renderMenu();
    open(view);

    const create = view.getByRole("menuitem", { name: /Create your own design system/ });
    expect(create.getAttribute("aria-disabled")).toBe("true");
    expect(create.textContent).toContain("Coming soon");
    expect(create.tagName).not.toBe("BUTTON");
    expect(create.hasAttribute("tabindex")).toBe(false);

    fireEvent.click(create);
    fireEvent.keyDown(create, { key: "Enter" });
    expect(chosen).toEqual([]);
    expect(view.getByRole("menu")).toBeTruthy();
  });

  test("leaves out the create-your-own action unless asked", () => {
    const { view } = renderMenu({ createOwn: false });
    open(view);
    expect(view.queryByText(/Create your own/)).toBeNull();
  });

  test("selecting a row reports it, closes the menu and returns focus to the trigger", () => {
    const { view, chosen } = renderMenu();
    open(view);

    fireEvent.click(row(view, "Afterglow"));

    expect(chosen).toEqual(["afterglow"]);
    expect(view.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger(view));
  });

  test("arrow keys move between rows, wrap around and skip the disabled action", () => {
    const { view } = renderMenu();
    trigger(view).focus();

    fireEvent.keyDown(trigger(view), { key: "ArrowDown" });
    expect(document.activeElement).toBe(row(view, "Margin"));

    fireEvent.keyDown(row(view, "Margin"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(row(view, "Afterglow"));
    fireEvent.keyDown(row(view, "Afterglow"), { key: "ArrowDown" });
    fireEvent.keyDown(row(view, "Schematic"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(row(view, "Margin"));

    fireEvent.keyDown(row(view, "Margin"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(row(view, "Schematic"));
    fireEvent.keyDown(row(view, "Schematic"), { key: "Home" });
    expect(document.activeElement).toBe(row(view, "Margin"));
    fireEvent.keyDown(row(view, "Margin"), { key: "End" });
    expect(document.activeElement).toBe(row(view, "Schematic"));
  });

  test("a keyboard open lands on the selected row, and a focused row is chosen with a click", () => {
    const { view, chosen } = renderMenu({ value: "afterglow" });
    trigger(view).focus();

    fireEvent.keyDown(trigger(view), { key: "ArrowUp" });
    expect(document.activeElement).toBe(row(view, "Afterglow"));

    // Enter and Space on a focused button fire a click.
    fireEvent.click(row(view, "Schematic"));
    expect(chosen).toEqual(["schematic"]);
  });

  test("Escape closes the menu and returns focus to the trigger", () => {
    const { view } = renderMenu();
    trigger(view).focus();
    fireEvent.keyDown(trigger(view), { key: "ArrowDown" });

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(view.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger(view));
  });

  test("a click outside closes the menu without choosing and gives focus back", async () => {
    const { view, chosen } = renderMenu();
    trigger(view).focus();
    fireEvent.keyDown(trigger(view), { key: "ArrowDown" });

    fireEvent.pointerDown(document.body);
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)));

    expect(view.queryByRole("menu")).toBeNull();
    expect(chosen).toEqual([]);
    expect(document.activeElement).toBe(trigger(view));
  });

  test("hovering a row floats a card with its previews exactly as returned, its name and summary", () => {
    const { view } = renderMenu();
    open(view);
    expect(preview(view)).toBeNull();

    fireEvent.mouseEnter(row(view, "Margin"));

    const card = preview(view)!;
    expect(card.textContent).toContain("Margin");
    expect(card.textContent).toContain("Quiet Swiss minimalism.");
    expect(Array.from(card.querySelectorAll("img")).map((image) => image.getAttribute("src"))).toEqual([
      "/api/v1/design-systems/margin/1/previews/1.png",
      "/api/v1/design-systems/margin/1/previews/2.png",
    ]);
    expect(row(view, "Margin").getAttribute("aria-describedby")).toBe(card.id);
  });

  test("moving between rows swaps the card in place and leaving the menu hides it", () => {
    const { view } = renderMenu();
    open(view);

    fireEvent.mouseEnter(row(view, "Margin"));
    fireEvent.mouseEnter(row(view, "Afterglow"));
    expect(view.getAllByRole("tooltip")).toHaveLength(1);
    expect(preview(view)!.textContent).toContain("Warm gradients on dark.");
    expect(row(view, "Afterglow").hasAttribute("data-active")).toBe(true);
    expect(row(view, "Margin").hasAttribute("data-active")).toBe(false);

    fireEvent.mouseLeave(view.getByRole("menu"));
    expect(preview(view)).toBeNull();
  });

  test("keyboard focus on a row shows the same card, and picking does not need it", () => {
    const { view, chosen } = renderMenu();
    trigger(view).focus();
    fireEvent.keyDown(trigger(view), { key: "ArrowDown" });
    expect(preview(view)!.textContent).toContain("Margin");

    fireEvent.keyDown(row(view, "Margin"), { key: "ArrowDown" });
    expect(preview(view)!.textContent).toContain("Afterglow");

    // A touch tap selects without ever hovering.
    fireEvent.click(row(view, "Schematic"));
    expect(chosen).toEqual(["schematic"]);
  });

  test("a system without previews shows its name and no images", () => {
    const { view } = renderMenu();
    open(view);
    fireEvent.mouseEnter(row(view, "Schematic"));

    expect(preview(view)!.textContent).toBe("Schematic");
    expect(preview(view)!.querySelector("img")).toBeNull();
  });

  test("offers a keep-current choice that reports the empty sentinel and has no card", () => {
    const { view, chosen } = renderMenu({
      value: "afterglow",
      createOwn: false,
      keepLabel: "Keep current design (Margin)",
    });
    open(view);

    fireEvent.mouseEnter(row(view, "Keep current design (Margin)"));
    expect(preview(view)).toBeNull();
    fireEvent.click(row(view, "Keep current design (Margin)"));
    expect(chosen).toEqual([KEEP_DESIGN_SYSTEM]);
  });

  test("has no keep-current choice unless asked", () => {
    const { view } = renderMenu();
    open(view);
    expect(view.queryByText(/Keep current/)).toBeNull();
  });

  test("a disabled menu cannot be opened", () => {
    const { view } = renderMenu({ disabled: true });
    fireEvent.click(trigger(view));
    expect(view.queryByRole("menu")).toBeNull();
  });
});
