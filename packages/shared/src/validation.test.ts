import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  channelCustomizationSchema,
  ratingSchema,
  registerSchema,
  videoMetadataSchema
} from "./validation.js";

describe("shared validation", () => {
  it("normalizes registration email and enforces strong password length", () => {
    const parsed = registerSchema.parse({
      username: "archive_user",
      email: "USER@EXAMPLE.TEST",
      password: "long-password-value"
    });
    assert.equal(parsed.email, "user@example.test");
    assert.throws(() =>
      registerSchema.parse({ username: "bad", email: "bad@example.test", password: "short" })
    );
  });

  it("rejects out-of-range ratings", () => {
    assert.equal(ratingSchema.parse({ ratingValue: 5 }).ratingValue, 5);
    assert.throws(() => ratingSchema.parse({ ratingValue: 6 }));
  });

  it("limits video metadata and channel colors", () => {
    const video = videoMetadataSchema.parse({
      title: "Home movie",
      description: "",
      tags: Array.from({ length: 20 }, (_, index) => `tag-${index}`),
      category: "People",
      visibility: "PUBLIC",
      allowEmbedding: true
    });
    assert.equal(video.tags.length, 20);
    assert.throws(() => videoMetadataSchema.parse({ title: "", tags: [] }));
    assert.deepEqual(channelCustomizationSchema.parse({ backgroundColor: "#ffffff", textColor: "#333333", linkColor: "#0033cc" }), {
      backgroundColor: "#ffffff",
      textColor: "#333333",
      linkColor: "#0033cc"
    });
    assert.throws(() => channelCustomizationSchema.parse({ backgroundColor: "red", textColor: "#333333", linkColor: "#0033cc" }));
  });
});
