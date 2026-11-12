// @vitest-environment node
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callStream, callText, describeError } from "@/lib/ai/call";

const KEY = "AIzaSyTestKeyThatMustNeverBeLogged1234567";

// A model whose every call fails the way Google's quota error does.
function failing(message: string, statusCode = 429) {
  const error = new APICallError({
    message,
    url: "https://generativelanguage.googleapis.com/v1beta/models/x",
    requestBodyValues: {},
    statusCode,
    isRetryable: false,
  });
  return new MockLanguageModelV4({
    doGenerate: async () => {
      throw error;
    },
    doStream: async () => {
      throw error;
    },
  });
}

let model: MockLanguageModelV4;
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => () => model,
}));

/** The rows printed as "[ai_error] {...}". */
function errorRows(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls
    .filter(([tag]: unknown[]) => tag === "[ai_error]")
    .map(([, row]: unknown[]) => JSON.parse(row as string));
}

beforeEach(() => {
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", KEY);
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("[ai_error] log", () => {
  it("prints Google's real status and message when a call fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    model = failing("You exceeded your current quota, please check your plan.");
    await expect(
      callText({ module: 3, feature: "test" }, { prompt: "hi" }),
    ).rejects.toThrow();
    const [row] = errorRows(spy);
    expect(row).toMatchObject({
      module: 3,
      feature: "test",
      model: "google/gemini-3.5-flash-lite",
      status: 429,
    });
    expect(row.message).toContain("exceeded your current quota");
  });

  it("prints it when a streamed answer fails, which is what Ask Copper uses", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    model = failing("This model is no longer available to new users.", 404);
    const result = callStream(
      { module: 2, feature: "ask-copper" },
      { messages: [{ role: "user", content: "hi" }] },
    );
    for await (const part of result.fullStream) void part;
    await vi.waitFor(() => expect(errorRows(spy)).toHaveLength(1));
    expect(errorRows(spy)[0]).toMatchObject({
      feature: "ask-copper",
      status: 404,
    });
    expect(errorRows(spy)[0].message).toContain("no longer available");
  });

  it("never prints the API key", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    model = failing(`API key ${KEY} is not valid`, 400);
    await expect(
      callText({ module: 3, feature: "test" }, { prompt: "hi" }),
    ).rejects.toThrow();
    const printed = JSON.stringify(spy.mock.calls);
    expect(printed).not.toContain(KEY);
    expect(printed).toContain("[key]");
  });

  it("prints nothing when the key just isn't set (the setup card covers that)", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      callText({ module: 3, feature: "test" }, { prompt: "hi" }),
    ).rejects.toThrow();
    expect(errorRows(spy)).toEqual([]);
  });
});

describe("describeError", () => {
  it("digs Google's error out of a 'failed after 3 attempts' wrapper", () => {
    const inner = Object.assign(new Error("Quota exceeded for metric X"), {
      statusCode: 429,
    });
    const wrapper = Object.assign(new Error("Failed after 3 attempts."), {
      lastError: inner,
    });
    expect(describeError(wrapper)).toEqual({
      status: 429,
      message: "Quota exceeded for metric X",
    });
  });

  it("squeezes line breaks, shortens very long messages and handles non-errors", () => {
    expect(describeError(new Error("a\n\n  b")).message).toBe("a b");
    expect(describeError(new Error("x".repeat(2000))).message).toHaveLength(
      601,
    );
    expect(describeError("plain text")).toEqual({
      status: null,
      message: "plain text",
    });
  });

  it("blanks keys in both Google key formats", () => {
    const message = describeError(
      new Error(
        "bad AIzaSyABCDEFGHIJKLMNOPQRSTUV and AQ.Ab8RN6IJKLMNOPQRSTUVWXYZ0123",
      ),
    ).message;
    expect(message).toBe("bad [key] and [key]");
  });
});
