#!/usr/bin/env node
// scripts/decode-pty-recording.ts
// Run with: npx tsx scripts/decode-pty-recording.ts tmp/pty-recordings/<session>/<file>.ndjson [--props=key1,key2] [--first=n] [--terminal-output] [--type=value] [--save=output.txt]
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const stripAnsi = (input: string): string => {
  return input
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\x1b\[[0-9;:?]*[A-Za-z]/g, "")
    .replace(/\r/g, "");
};

const args = process.argv.slice(2);
const inputPath = args.find((arg) => !arg.startsWith("--")) ?? process.env.FILE;
const propsArg = args.find((arg) => arg.startsWith("--props="));
const firstArg = args.find((arg) => arg.startsWith("--first="));
const typeArg = args.find((arg) => arg.startsWith("--type="));
const saveArg = args.find((arg) => arg.startsWith("--save="));
const terminalOutput = args.includes("--terminal-output");

const filterProps = propsArg ? propsArg.split("=")[1].split(",") : null;
const first = firstArg ? parseInt(firstArg.split("=")[1], 10) : null;
const filterType = typeArg ? typeArg.split("=")[1] : null;
const saveToFile = saveArg ? saveArg.split("=")[1] : null;

if (!inputPath) {
  console.error(
    "Usage: npx tsx scripts/decode-pty-recording.ts <path/to/recording.ndjson> [--props=key1,key2] [--first=n] [--terminal-output] [--type=value] [--save=output.txt]",
  );
  process.exit(1);
}

const resolvedPath = resolve(inputPath);

let raw: string;
try {
  raw = readFileSync(resolvedPath, "utf8");
} catch (error) {
  console.error(`Failed to read "${resolvedPath}":`, error);
  process.exit(1);
}

const lines = raw
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

let printed = 0;
const outputLines: string[] = [];

for (let index = 0; index < lines.length; index++) {
  if (first !== null && printed >= first) break;

  const line = lines[index];
  let entry: Record<string, unknown>;
  try {
    entry = JSON.parse(line) as Record<string, unknown>;
  } catch (error) {
    console.error(
      `Skipping line ${index + 1}: failed to parse JSON (${error instanceof Error ? error.message : String(error)})`,
    );
    continue;
  }

  if (filterType !== null && entry.type !== filterType) {
    continue;
  }

  if (
    entry.encoding === "base64/gzip" &&
    typeof entry.payload === "string" &&
    entry.payload.length > 0
  ) {
    try {
      const decoded = gunzipSync(Buffer.from(entry.payload, "base64")).toString(
        "utf8",
      );
      entry.data = decoded;
    } catch (error) {
      console.error(
        `Warning: failed to decode payload on line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const output = filterProps
    ? Object.fromEntries(
        filterProps
          .filter((key) => key in entry)
          .map((key) => [key, entry[key]]),
      )
    : entry;

  let entryOutput: string;
  if (terminalOutput && entry.data) {
    entryOutput =
      JSON.stringify(output, null, 2) +
      "\n************************** TERMINAL OUTPUT START ********************************\n" +
      stripAnsi(entry.data as string) +
      "\n************************** TERMINAL OUTPUT END ********************************";
  } else {
    entryOutput = JSON.stringify(output, null, 2);
  }

  if (saveToFile) {
    outputLines.push(entryOutput);
  } else {
    console.log(entryOutput);
  }

  printed++;
}

if (saveToFile) {
  const outputPath = resolve(saveToFile);
  writeFileSync(outputPath, outputLines.join("\n\n"), "utf8");
  console.log(`Output saved to: ${outputPath}`);
}
