import { describe, it, expect } from "vitest";
import { fileIconUrl, folderIconUrl } from "./iconResolver";

describe("iconResolver", () => {
  describe("fileIconUrl", () => {
    it("returns the same URL for repeated calls with the same filename", () => {
      const url1 = fileIconUrl("test.ts");
      const url2 = fileIconUrl("test.ts");
      expect(url1).toBe(url2);
    });

    it("returns the same object reference for memoized results", () => {
      const url1 = fileIconUrl("example.js");
      const url2 = fileIconUrl("example.js");
      expect(url1).toBe(url2);
    });

    it("returns different URLs for different file extensions", () => {
      const tsUrl = fileIconUrl("test.ts");
      const jsUrl = fileIconUrl("test.js");
      expect(tsUrl).not.toBe(jsUrl);
    });

    it("handles case-insensitive filenames", () => {
      const url1 = fileIconUrl("TEST.TS");
      const url2 = fileIconUrl("test.ts");
      expect(url1).toBe(url2);
    });

    it("returns a non-empty string for valid files", () => {
      const url = fileIconUrl("test.ts");
      expect(url).toBeTruthy();
      expect(typeof url).toBe("string");
    });

    it("returns a data URL or empty string", () => {
      const url = fileIconUrl("unknown-extension.xyz123");
      expect(url).toBeDefined();
      expect(typeof url).toBe("string");
    });
  });

  describe("folderIconUrl", () => {
    it("returns the same URL for repeated calls with the same folder name and state", () => {
      const url1 = folderIconUrl("src", true);
      const url2 = folderIconUrl("src", true);
      expect(url1).toBe(url2);
    });

    it("returns different URLs for expanded vs closed states", () => {
      const openUrl = folderIconUrl("docs", true);
      const closedUrl = folderIconUrl("docs", false);
      expect(openUrl).not.toBe(closedUrl);
    });

    it("handles case-insensitive folder names", () => {
      const url1 = folderIconUrl("SRC", false);
      const url2 = folderIconUrl("src", false);
      expect(url1).toBe(url2);
    });

    it("returns different URLs for different folder names", () => {
      const srcUrl = folderIconUrl("src", true);
      const nodeModulesUrl = folderIconUrl("node_modules", true);
      expect(srcUrl).not.toBe(nodeModulesUrl);
    });

    it("returns a non-empty string for valid folders", () => {
      const url = folderIconUrl("src", false);
      expect(url).toBeTruthy();
      expect(typeof url).toBe("string");
    });

    it("memoizes separately for open and closed states", () => {
      const openUrl1 = folderIconUrl("test-folder", true);
      const closedUrl1 = folderIconUrl("test-folder", false);
      const openUrl2 = folderIconUrl("test-folder", true);
      const closedUrl2 = folderIconUrl("test-folder", false);

      expect(openUrl1).toBe(openUrl2);
      expect(closedUrl1).toBe(closedUrl2);
      expect(openUrl1).not.toBe(closedUrl1);
    });
  });
});
