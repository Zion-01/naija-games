import { describe, expect, it } from "vitest";
import { scrubUrl } from "../src/lib/analytics";

describe("page view URLs", () => {
  it("drops room codes, query strings and hashes", () => {
    expect(scrubUrl("https://naija-games.vercel.app/play/ABCD")).toBe("https://naija-games.vercel.app/play/[code]");
    expect(scrubUrl("https://naija-games.vercel.app/play/ABCD/opengraph-image")).toBe("https://naija-games.vercel.app/play/[code]/opengraph-image");
    expect(scrubUrl("https://naija-games.vercel.app/profile?code=xyz#access_token=t")).toBe("https://naija-games.vercel.app/profile");
    expect(scrubUrl("https://naija-games.vercel.app/whot")).toBe("https://naija-games.vercel.app/whot");
  });
});
