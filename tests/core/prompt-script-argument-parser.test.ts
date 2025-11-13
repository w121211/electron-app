// tests/prompt-script-argument-parser.test.ts
import { substituteArguments } from "../src/core/services/prompt-script/prompt-script-parser.js";
import { describe, it, expect } from "vitest";

describe("substituteArguments", () => {
  it("should substitute positional arguments", () => {
    const content = "This is a test with $1 and $2.";
    const args = ["arg1", "arg2"];
    const result = substituteArguments(content, args);
    expect(result).toBe("This is a test with arg1 and arg2.");
  });

  it("should handle out-of-bounds positional arguments by replacing with an empty string", () => {
    const content = "Test with $1, $2, and $3.";
    const args = ["arg1"];
    const result = substituteArguments(content, args);
    expect(result).toBe("Test with arg1, , and .");
  });

  it("should substitute the $ARGUMENTS variable", () => {
    const content = "All arguments: $ARGUMENTS";
    const args = ["arg1", "arg2", "arg3"];
    const result = substituteArguments(content, args);
    expect(result).toBe("All arguments: arg1 arg2 arg3");
  });

  it("should handle an empty args array", () => {
    const content = "This is $1 and all are $ARGUMENTS.";
    const args: string[] = [];
    const result = substituteArguments(content, args);
    expect(result).toBe("This is  and all are .");
  });

  it("should handle a mix of positional and $ARGUMENTS", () => {
    const content = "First: $1. All: $ARGUMENTS. Second: $2.";
    const args = ["one", "two", "three"];
    const result = substituteArguments(content, args);
    expect(result).toBe("First: one. All: one two three. Second: two.");
  });

  it("should not substitute prices or variables", () => {
    const content = "Price is $500, variable is $var.";
    const args = ["arg1"];
    const result = substituteArguments(content, args);
    expect(result).toBe("Price is $500, variable is $var.");
  });

  it("should not substitute placeholders with more than 2 digits", () => {
    const content = "This is $123.";
    const args = ["arg1"];
    const result = substituteArguments(content, args);
    expect(result).toBe("This is $123.");
  });

  it("should handle escaped positional arguments by un-escaping them", () => {
    const content = "This is an escaped argument: \\$1.";
    const args = ["arg1"];
    const result = substituteArguments(content, args);
    expect(result).toBe("This is an escaped argument: $1.");
  });

  it("should handle escaped $ARGUMENTS by un-escaping it", () => {
    const content = "This is an escaped arguments variable: \\$ARGUMENTS.";
    const args = ["arg1", "arg2"];
    const result = substituteArguments(content, args);
    expect(result).toBe("This is an escaped arguments variable: $ARGUMENTS.");
  });

  it("should handle a mix of escaped and unescaped arguments", () => {
    const content = "Escaped: \\$1. Substituted: $1. All escaped: \\$ARGUMENTS. All substituted: $ARGUMENTS.";
    const args = ["arg1"];
    const result = substituteArguments(content, args);
    expect(result).toBe("Escaped: $1. Substituted: arg1. All escaped: $ARGUMENTS. All substituted: arg1.");
  });

  it("should handle multiple occurrences of the same argument", () => {
    const content = "Arg 1 is $1, and again, $1.";
    const args = ["first"];
    const result = substituteArguments(content, args);
    expect(result).toBe("Arg 1 is first, and again, first.");
  });

  it("should correctly substitute arguments when $ARGUMENTS is also present", () => {
    const content = "Here is $1 and $2, and all together: $ARGUMENTS";
    const args = ["apple", "banana"];
    const result = substituteArguments(content, args);
    expect(result).toBe("Here is apple and banana, and all together: apple banana");
  });

  it("should return the original string if no placeholders are present", () => {
    const content = "This is a simple string with no arguments.";
    const args = ["arg1", "arg2"];
    const result = substituteArguments(content, args);
    expect(result).toBe(content);
  });
});
