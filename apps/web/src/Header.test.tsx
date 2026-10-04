import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Header } from "./App";

describe("application header", () => {
  it.each(["build", "match", "result"] as const)("renders an actionable brand on the %s step", (step) => {
    const markup = renderToStaticMarkup(<Header step={step} onHome={() => undefined} />);

    expect(markup).toContain('<button type="button" class="brand" aria-label="FootballSimSim home">');
    expect(markup).not.toContain('href="#"');
    expect(markup).toContain("01 Build");
    expect(markup).toContain("02 Match");
    expect(markup).toContain("03 Results");
  });
});
