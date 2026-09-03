import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import "fake-indexeddb/auto";
import { afterEach } from "vitest";

// jsdom has no Blob.text(), which every browser this app targets does have — without it
// the PGN file picker could not be exercised at all.
if (typeof Blob.prototype.text !== "function") {
  Blob.prototype.text = function text(this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

afterEach(cleanup);

// jsdom performs no layout, so every element measures 0x0. react-chessboard refuses to
// animate a piece across a zero-width square, which would make any test that plays a move
// on a mounted board throw. Give elements a plausible size instead.
const SQUARE_PX = 64;
Element.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
  return {
    width: SQUARE_PX,
    height: SQUARE_PX,
    top: 0,
    left: 0,
    bottom: SQUARE_PX,
    right: SQUARE_PX,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
};

// jsdom ships no ResizeObserver, which the board uses to keep its squares on whole pixels.
// Constructing one is enough for the board to mount; without layout there is nothing to observe.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
