import { beforeEach, describe, expect, test, vi } from "vitest";
import { lastTab, rememberTab } from "./remembered";

beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
  });
});

describe("the tab the app reopens on", () => {
  test("is the last tab used", () => {
    rememberTab("lista");
    expect(lastTab()).toBe("lista");
  });

  test("is never Scan, so opening the app doesn't start the camera", () => {
    rememberTab("lista");
    rememberTab("scan");
    expect(lastTab()).toBe("lista");
  });

  test("is Koti when Scan was remembered before Scan stopped being remembered", () => {
    localStorage.setItem("komero.lastTab", "scan");
    expect(lastTab()).toBe("koti");
  });
});
