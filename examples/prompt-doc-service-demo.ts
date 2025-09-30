// examples/prompt-doc-service-demo.ts
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PromptDocRepository } from "../src/core/services/prompt-doc/prompt-doc-repository.js";
import {
  PromptDocService,
  type PromptDocLocationGuard,
} from "../src/core/services/prompt-doc/prompt-doc-service.js";

async function main(): Promise<void> {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "prompt-doc-demo-"));
  const promptDirectory = path.join(tempRoot, "prompts");
  await fs.mkdir(promptDirectory, { recursive: true });

  const locationGuard: PromptDocLocationGuard = {
    async isPathInProjectFolder(absolutePath) {
      return absolutePath.startsWith(promptDirectory);
    },
  };

  const repository = new PromptDocRepository();
  const promptService = new PromptDocService(repository, locationGuard);

  const doc = await promptService.createPromptDoc({
    directory: promptDirectory,
    id: randomUUID(),
    title: "Prompt Demo",
    modelId: "openai/gpt-4o-mini",
    tags: ["demo", "prompt-doc"],
    context: "Initial context captured during onboarding.",
    initialLatestPrompt: "List three focus areas for the next release.",
  });

  const latestPath = doc.absoluteFilePath;

  await promptService.commitLatestPrompt(latestPath);
  await promptService.appendModelReference({
    absoluteFilePath: latestPath,
    referenceId: "model-message-demo-001",
  });
  await promptService.appendToolCallReference({
    absoluteFilePath: latestPath,
    referenceId: "tool-call-demo-001",
  });
  await promptService.appendToolResultReference({
    absoluteFilePath: latestPath,
    referenceId: "tool-result-demo-001",
  });

  await promptService.updateLatestPrompt({
    absoluteFilePath: latestPath,
    latestPrompt: "Great. Draft an announcement for internal stakeholders.",
  });

  const finalDoc = await promptService.loadPromptDoc(latestPath);

  console.info("Prompt document created at:", finalDoc.absoluteFilePath);
  console.info("Conversation entries:", finalDoc.conversation);
  console.info("Latest prompt:\n", finalDoc.latestPrompt);

  const fileContents = await fs.readFile(latestPath, "utf8");
  console.info("\nRaw file contents:\n");
  console.info(fileContents);
}

main().catch((error) => {
  console.error("Prompt doc demo failed", error);
});
