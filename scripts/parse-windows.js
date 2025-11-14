#!/usr/bin/env node
// scripts/parse-windows.js
const fs = require("fs");

try {
    const input = fs.readFileSync(0, "utf8");
    if (!input) {
        // Exit gracefully if there's no input
        process.exit(0);
    }
    const data = JSON.parse(input);

    if (!data.windows || !Array.isArray(data.windows)) {
        console.error("Error: JSON does not contain a 'windows' array.");
        console.error("Received:", input);
        process.exit(1);
    }

    data.windows.forEach(w => {
        const { windowId, appName, title } = w;
        // Sanitize title to remove characters that would break the output format
        const sanitizedTitle = String(title || '').replace(/\t|\n|\r/g, ' ');
        console.log(`${windowId}\t${appName}\t${sanitizedTitle}`);
    });

} catch (e) {
    console.error("Error: Failed to parse JSON from stdin.");
    if (e instanceof Error) {
        console.error(e.message);
    }
    // Also print the problematic input
    const input = fs.readFileSync(0, "utf8");
    console.error("Received:", input);
    process.exit(1);
}
