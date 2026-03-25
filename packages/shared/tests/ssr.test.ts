import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import {
  readBootstrapData,
  renderBootstrapScript,
} from "../src/ssr";

describe("renderBootstrapScript", () => {
  test("round-trips bootstrap data with script-breaking characters", () => {
    const payload = {
      user: `octo"cat`,
      session: "</script><div>",
      marker: "a&b",
    };
    const globalWithDocument = globalThis as { document?: any };
    const previousDocument = globalWithDocument.document;
    const window = new Window();

    globalWithDocument.document = window.document;

    try {
      window.document.body.innerHTML = renderBootstrapScript("boot", payload);

      expect(window.document.body.innerHTML).not.toContain("</script><div>");
      expect(readBootstrapData("boot")).toEqual(payload);
    } finally {
      if (previousDocument === undefined) {
        delete globalWithDocument.document;
      } else {
        globalWithDocument.document = previousDocument;
      }
    }
  });
});
