// src/core/utils/chat-template-parser.ts
import { promises as fs } from "fs";
import matter from "gray-matter";

/**
 * Parses a chat template file, validates its frontmatter, and substitutes arguments.
 */
export async function parseChatTemplate(
  templatePath: string,
  args: string[],
): Promise<string> {
  const fileContent = await fs.readFile(templatePath, "utf-8");
  const { data, content: templateBody } = matter(fileContent);

  // 1. Validate frontmatter
  if (data.type !== "chat-template") {
    throw new Error(
      `Invalid template type. Expected "chat-template", but got "${data.type}".`,
    );
  }

  // 2. Substitute arguments
  let processedContent = templateBody;
  processedContent = processedContent.split("$ARGUMENTS").join(args.join(" "));

  args.forEach((arg, i) => {
    processedContent = processedContent.split(`$${i + 1}`).join(arg);
  });

  return processedContent.trim();
}
