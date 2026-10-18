import "@testing-library/jest-dom/vitest";

/**
 * jsdom does not implement IntersectionObserver, which Framer Motion uses for
 * `whileInView` animations. Provide a no-op stub so components render in tests.
 */
const IntersectionObserverStub = class {
  root = null;
  rootMargin = "";
  thresholds = [];
  scrollMargin = "";
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): unknown[] {
    return [];
  }
};

if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver =
    IntersectionObserverStub as unknown as typeof IntersectionObserver;
}

/** jsdom does not implement matchMedia; provide a stub for responsive hooks. */
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
