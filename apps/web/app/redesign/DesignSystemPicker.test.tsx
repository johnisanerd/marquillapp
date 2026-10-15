import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import type { DesignSystemSummary } from "./designSystems";

const { default: DesignSystemPicker, KEEP_DESIGN_SYSTEM } = await import("./DesignSystemPicker");

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
];

describe("DesignSystemPicker", () => {
  test("shows each system's name, summary and previews exactly as the API returned them", () => {
    const view = render(<DesignSystemPicker id="picker" systems={systems} value="margin" onChange={() => {}} />);

    expect(view.getByText("Margin")).toBeTruthy();
    expect(view.getByText("Warm gradients on dark.")).toBeTruthy();
    const sources = view.getAllByRole("img").map((image) => image.getAttribute("src"));
    expect(sources).toEqual([
      "/api/v1/design-systems/margin/1/previews/1.png",
      "/api/v1/design-systems/margin/1/previews/2.png",
      "/api/v1/design-systems/afterglow/2/previews/1.png",
    ]);
  });

  test("marks the value as selected and reports a new choice", () => {
    const chosen: string[] = [];
    const view = render(<DesignSystemPicker id="picker" systems={systems} value="margin" onChange={(id) => chosen.push(id)} />);

    const radios = view.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((radio) => radio.checked)).toEqual([true, false]);
    fireEvent.click(view.getByLabelText(/Afterglow/));
    expect(chosen).toEqual(["afterglow"]);
  });

  test("offers a keep-current choice that reports the empty sentinel", () => {
    const chosen: string[] = [];
    const view = render(
      <DesignSystemPicker
        id="picker"
        systems={systems}
        value="afterglow"
        onChange={(id) => chosen.push(id)}
        keepLabel="Keep current design (Margin)"
      />,
    );

    expect(view.getAllByRole("radio")).toHaveLength(3);
    fireEvent.click(view.getByLabelText(/Keep current design \(Margin\)/));
    expect(chosen).toEqual([KEEP_DESIGN_SYSTEM]);
  });

  test("has no keep-current choice unless asked", () => {
    const view = render(<DesignSystemPicker id="picker" systems={systems} value="" onChange={() => {}} />);
    expect(view.queryByLabelText(/Keep current/)).toBeNull();
  });
});
