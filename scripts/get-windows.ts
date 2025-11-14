#!/usr/bin/env node
// scripts/get-windows.ts
// Run: npx tsx scripts/get-windows.ts
import { openWindows } from "get-windows";

async function main() {
  try {
    const windows = await openWindows();
    console.log("Open windows:", JSON.stringify(windows, null, 2));
  } catch (error) {
    console.error("Error getting open windows:", error);
    process.exit(1);
  }
}

main();
