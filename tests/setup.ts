import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import "fake-indexeddb/auto";
import { afterEach } from "vitest";

afterEach(cleanup);

// jsdom ships no ResizeObserver, which the board uses to keep its squares on whole pixels.
// Constructing one is enough for the board to mount; without layout there is nothing to observe.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
