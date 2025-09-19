// src/renderer/src/utils/xterm-utils.ts
import { Terminal } from "@xterm/xterm";

export interface ITerminalFont {
  fontFamily: string;
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  charWidth?: number;
  charHeight?: number;
}

/**
 * Reference: https://github.com/microsoft/vscode  getFont()
 */
export function getFont(w: Window, xterm: Terminal): ITerminalFont {
  const fontFamily = xterm.options.fontFamily;
  const fontSize = xterm.options.fontSize;
  const letterSpacing = xterm.options.letterSpacing;
  const lineHeight = xterm.options.lineHeight;

  // Get the character dimensions from xterm if it's available
  const xtermCore = (xterm as any)._core;
  if (xtermCore?._renderService?._renderer.value) {
    const cellDims = xtermCore._renderService.dimensions.css.cell;
    if (cellDims?.width && cellDims?.height) {
      return {
        fontFamily,
        fontSize,
        letterSpacing,
        lineHeight,
        charHeight: cellDims.height / lineHeight,
        charWidth:
          cellDims.width - Math.round(letterSpacing) / w.devicePixelRatio,
      };
    }
  }

  // Fall back to measuring the font ourselves
  return this._measureFont(w, fontFamily, fontSize, letterSpacing, lineHeight);
}

export function getXtermScaledDimensions(
  w: Window,
  font: ITerminalFont,
  width: number,
  height: number,
): { rows: number; cols: number } | null {
  if (!font.charWidth || !font.charHeight) {
    return null;
  }

  // Because xterm.js converts from CSS pixels to actual pixels through
  // the use of canvas, window.devicePixelRatio needs to be used here in
  // order to be precise. font.charWidth/charHeight alone as insufficient
  // when window.devicePixelRatio changes.
  const scaledWidthAvailable = width * w.devicePixelRatio;

  const scaledCharWidth =
    font.charWidth * w.devicePixelRatio + font.letterSpacing;
  const cols = Math.max(Math.floor(scaledWidthAvailable / scaledCharWidth), 1);

  const scaledHeightAvailable = height * w.devicePixelRatio;
  const scaledCharHeight = Math.ceil(font.charHeight * w.devicePixelRatio);
  const scaledLineHeight = Math.floor(scaledCharHeight * font.lineHeight);
  const rows = Math.max(
    Math.floor(scaledHeightAvailable / scaledLineHeight),
    1,
  );

  return { rows, cols };
}
