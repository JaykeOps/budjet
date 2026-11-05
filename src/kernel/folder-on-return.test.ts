import { describe, expect, it, vi } from "vitest";
import {
  askToOpen,
  type ReturningFolder,
  tryFolderOnReturn,
} from "./folder-on-return";

/** A remembered folder that fails with each of these in turn, then is fine. */
function aFolder({
  failures = [],
  allow = true,
}: {
  failures?: string[];
  allow?: boolean;
} = {}): ReturningFolder {
  const left = [...failures];
  return {
    name: "Budget folder",
    async reach() {
      const failure = left.shift();
      if (failure) throw new DOMException("Can't reach it", failure);
    },
    askForAccess: async () => allow,
  };
}

describe("returning to a remembered folder", () => {
  it("opens the Budget when the folder can be reached", async () => {
    expect(await tryFolderOnReturn(aFolder())).toBe("open");
  });

  it("reads NotAllowedError as access having lapsed", async () => {
    const folder = aFolder({ failures: ["NotAllowedError"] });

    expect(await tryFolderOnReturn(folder)).toBe("lapsed");
  });

  it("reads NotFoundError as the folder being lost", async () => {
    const folder = aFolder({ failures: ["NotFoundError"] });

    expect(await tryFolderOnReturn(folder)).toBe("lost");
  });

  it("opens from the Local Copy on any other failure, leaving it to the save state", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const folder = aFolder({ failures: ["NotReadableError"] });

    expect(await tryFolderOnReturn(folder)).toBe("open");
  });
});

describe("asking to open after access lapsed", () => {
  it("opens once the browser gives access", async () => {
    expect(await askToOpen(aFolder())).toBe("open");
  });

  it("stays lapsed when the user declines", async () => {
    const reach = vi.fn();
    const folder = { ...aFolder({ allow: false }), reach };

    expect(await askToOpen(folder)).toBe("lapsed");
    expect(reach).not.toHaveBeenCalled();
  });

  it("finds a lost folder by trying it, though the browser gave access", async () => {
    const folder = aFolder({ failures: ["NotFoundError"] });

    expect(await askToOpen(folder)).toBe("lost");
  });

  it("stays lapsed when asking itself is refused", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const folder = {
      ...aFolder(),
      askForAccess: () =>
        Promise.reject(new DOMException("No gesture", "SecurityError")),
    };

    expect(await askToOpen(folder)).toBe("lapsed");
  });
});
