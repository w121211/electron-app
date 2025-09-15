// src/renderer/src/utils/at-command-parser.ts

export interface TextToken {
  type: "text";
  raw: string;
}

export interface AtCommandToken {
  type: "at-command";
  raw: string;
  filePath: string;
}

export type Token = TextToken | AtCommandToken;

/**
 * Parses any text string and returns an array of tokens,
 * splitting on @-commands (file path references).
 * 
 * @param text The text to parse
 * @returns Array of TextToken and AtCommandToken objects
 */
export function parseAtCommands(text: string): Token[] {
  const tokens: Token[] = [];
  
  // Regex pattern supporting both unquoted and quoted file paths
  const atCommandRegex = /(?:^|\s)@(?:"([^"]+)"|([^\s]+))/g;
  
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  while ((match = atCommandRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const filePath = match[1] || match[2]; // match[1] for quoted, match[2] for unquoted
    const matchStart = match.index;
    const matchEnd = matchStart + fullMatch.length;
    
    // Add text token for content before this @-command
    if (matchStart > lastIndex) {
      const textContent = text.slice(lastIndex, matchStart);
      if (textContent) {
        tokens.push({
          type: "text",
          raw: textContent,
        });
      }
    }
    
    // Add at-command token
    tokens.push({
      type: "at-command",
      raw: fullMatch,
      filePath,
    });
    
    lastIndex = matchEnd;
  }
  
  // Add remaining text as a text token
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex);
    if (remainingText) {
      tokens.push({
        type: "text",
        raw: remainingText,
      });
    }
  }
  
  return tokens;
}