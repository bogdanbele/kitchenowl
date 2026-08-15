import { describe, expect, it } from "vitest";
import { dataUrlBytes, fitWithin, MAX_EDGE } from "./image";

describe("fitWithin", () => {
  it("scales a phone photo down by its long edge", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
  });

  it("uses the long edge whichever way the photo is turned", () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });

  it("leaves a small image alone rather than blowing it up", () => {
    // Upscaling adds bytes and no detail.
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("never rounds a dimension to zero", () => {
    // A panorama is the case that would: 20000x1 at scale 0.08.
    const { height } = fitWithin(20000, 1);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it("copes with a zero-sized image instead of dividing by it", () => {
    expect(fitWithin(0, 0)).toEqual({ width: 0, height: 0 });
  });

  it("respects a caller's own limit", () => {
    expect(fitWithin(2000, 1000, 500)).toEqual({ width: 500, height: 250 });
  });

  it("has a default long edge that is legible for print", () => {
    expect(MAX_EDGE).toBeGreaterThanOrEqual(1024);
  });
});

describe("dataUrlBytes", () => {
  it("measures the decoded size, not the base64 length", () => {
    // "hello" is 5 bytes and 8 base64 characters.
    expect(dataUrlBytes("data:image/jpeg;base64,aGVsbG8=")).toBe(5);
  });

  it("accounts for both padding characters", () => {
    expect(dataUrlBytes("data:image/jpeg;base64,aGVsbG8hIQ==")).toBe(7);
  });

  it("is zero for an empty payload", () => {
    expect(dataUrlBytes("data:image/jpeg;base64,")).toBe(0);
    expect(dataUrlBytes("")).toBe(0);
  });
});
