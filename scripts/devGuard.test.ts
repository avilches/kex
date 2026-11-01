import { describe, expect, it } from "vitest";
import { isColorValue, refuseWrite } from "./devGuard";
import { patchThemeSource } from "./theme-write-plugin";

const req = (headers: Record<string, string>) => ({ headers });
const good = { "content-type": "application/json", origin: "http://localhost:1420", host: "localhost:1420" };

describe("refuseWrite", () => {
  it("lets the local dev page through", () => {
    expect(refuseWrite(req(good))).toBeNull();
    expect(refuseWrite(req({ ...good, "content-type": "application/json; charset=utf-8" }))).toBeNull();
    expect(refuseWrite(req({ ...good, origin: "http://127.0.0.1:5173", host: "127.0.0.1:5173" }))).toBeNull();
    expect(refuseWrite(req({ ...good, origin: "http://[::1]:5173", host: "[::1]:5173" }))).toBeNull();
  });

  it("refuses a foreign origin", () => {
    expect(refuseWrite(req({ ...good, origin: "https://evil.example" }))).toBe("Origin is not local");
    expect(refuseWrite(req({ ...good, origin: "http://localhost.evil.example" }))).toBe("Origin is not local");
    expect(refuseWrite(req({ ...good, origin: "null" }))).toBe("Origin is not local");
  });

  it("refuses a request with no origin", () => {
    const { origin: _origin, ...rest } = good;
    expect(refuseWrite(req(rest))).toBe("Origin is required");
  });

  it("refuses a foreign host, the DNS rebinding case", () => {
    expect(refuseWrite(req({ ...good, host: "evil.example:1420" }))).toBe("Host is not local");
  });

  it("refuses anything that is not JSON, which is what a cross-site form can send", () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", ""]) {
      expect(refuseWrite(req({ ...good, "content-type": type }))).toBe("Content-Type must be application/json");
    }
  });
});

describe("isColorValue", () => {
  it("takes the colors the themes use", () => {
    for (const v of ["#fff", "#1a2b3c", "#1a2b3c80", "rgba(255,255,255,0.08)", "rgb(1 2 3 / 50%)", "oklch(0.7 0.1 200)"]) {
      expect(isColorValue(v), v).toBe(true);
    }
  });

  it("refuses what could leave the string literal or act as a replacement pattern", () => {
    for (const v of ['#fff", evil: "', "$&", "$1", "red; x", "javascript:1", '"', "`x`", "rgba(1,2,3,0.1)\n", "", 5, null]) {
      expect(isColorValue(v), String(v)).toBe(false);
    }
  });
});

describe("patchThemeSource", () => {
  const source = `export const t = {\n  dark: {\n    colors: {\n      background: "#000000",\n    },\n  },\n};\n`;

  it("writes a value containing replacement patterns literally", () => {
    const out = patchThemeSource(source, "dark", { background: "$&$1" });
    expect(out.source).toContain('background: "$&$1"');
    expect(out.source).not.toContain("#000000");
  });
});
