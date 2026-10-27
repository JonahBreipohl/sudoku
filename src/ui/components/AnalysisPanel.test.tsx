import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ANALYSIS_ERROR_MESSAGE } from "../useAnalysis";
import { AnalysisPanel } from "./AnalysisPanel";

const noop = () => undefined;

describe("AnalysisPanel states", () => {
  it("announces loading politely while idle or loading", () => {
    for (const status of ["idle", "loading"] as const) {
      const html = renderToStaticMarkup(<AnalysisPanel state={{ status }} onClose={noop} />);
      expect(html).toContain('role="status"');
      expect(html).toContain("Analysing your game");
    }
  });

  it("shows a friendly error as an alert, with Close still available", () => {
    const html = renderToStaticMarkup(
      <AnalysisPanel state={{ status: "error", message: ANALYSIS_ERROR_MESSAGE }} onClose={noop} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain(ANALYSIS_ERROR_MESSAGE);
    expect(html).toContain("Close analysis");
    expect(html).not.toContain("Try again"); // retry arrives with M7-08b
  });
});
