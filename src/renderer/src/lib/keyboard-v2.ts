// src/renderer/src/lib/keyboard-v2.ts

type ShortcutHandler = () => void | Promise<void>;

interface Shortcut {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: ShortcutHandler;
  preventDefault?: boolean;
}

type OS = "mac" | "windows" | "linux";

export class KeyboardV2 {
  private shortcuts: Shortcut[] = [];
  private os: OS;
  private boundHandler: (e: KeyboardEvent) => void;

  constructor() {
    this.os = this.detectOS();
    this.boundHandler = this.handleKeydown.bind(this);
    this.bind();
  }

  private detectOS(): OS {
    const ua = navigator.userAgent;
    if (ua.includes("Mac")) return "mac";
    if (ua.includes("Win")) return "windows";
    if (ua.includes("Linux")) return "linux";
    return "windows";
  }

  private bind(): void {
    document.addEventListener("keydown", this.boundHandler);
  }

  public register(
    key: string,
    handler: ShortcutHandler,
    options?: {
      meta?: boolean;
      ctrl?: boolean;
      shift?: boolean;
      alt?: boolean;
      preventDefault?: boolean;
    },
  ): void {
    this.shortcuts.push({
      key,
      handler,
      meta: options?.meta ?? false,
      ctrl: options?.ctrl ?? false,
      shift: options?.shift ?? false,
      alt: options?.alt ?? false,
      preventDefault: options?.preventDefault ?? true,
    });
  }

  public registerCrossPlatform(
    key: string,
    handler: ShortcutHandler,
    options?: {
      shift?: boolean;
      alt?: boolean;
      preventDefault?: boolean;
    },
  ): void {
    const isMac = this.os === "mac";
    this.register(key, handler, {
      meta: isMac,
      ctrl: !isMac,
      shift: options?.shift,
      alt: options?.alt,
      preventDefault: options?.preventDefault,
    });
  }

  private handleKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const isInput =
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.contentEditable === "true";

    if (isInput) {
      if (event.key !== "Escape" && !event.ctrlKey && !event.metaKey) {
        return;
      }
    }

    const shortcut = this.shortcuts.find((s) => this.matches(event, s));

    if (shortcut) {
      if (shortcut.preventDefault) {
        event.preventDefault();
      }
      void shortcut.handler();
    }
  }

  private matches(event: KeyboardEvent, shortcut: Shortcut): boolean {
    return (
      event.key === shortcut.key &&
      !!event.metaKey === !!shortcut.meta &&
      !!event.ctrlKey === !!shortcut.ctrl &&
      !!event.shiftKey === !!shortcut.shift &&
      !!event.altKey === !!shortcut.alt
    );
  }

  public destroy(): void {
    document.removeEventListener("keydown", this.boundHandler);
    this.shortcuts = [];
  }
}
