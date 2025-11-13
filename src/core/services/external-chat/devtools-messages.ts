// src/core/services/external-chat/devtools-messages.ts
import type { AiAssistantId } from "./automators-v2.js";

export type FunctionResult = {
  readonly status: "success" | "error" | "pending";
  readonly data?: any;
  readonly error?: string;
  readonly duration?: number;
};

export type SelectorTestResult = {
  readonly status: "found" | "not-found";
  readonly count: number;
  readonly samples: readonly (string | null)[];
};

export type SelectorResults = Record<string, SelectorTestResult>;

export type TestSummary = {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly duration: number;
};

export type DevToolsTestMessage =
  | {
      readonly type: "test:suite:start";
      readonly automatorId: AiAssistantId;
      readonly timestamp: string;
    }
  | {
      readonly type: "test:suite:complete";
      readonly automatorId: AiAssistantId;
      readonly timestamp: string;
      readonly summary: TestSummary;
    }
  | {
      readonly type: "test:started";
      readonly automatorId: AiAssistantId;
      readonly testName: string;
      readonly category: "selector" | "extractor" | "action" | "watcher";
      readonly timestamp: string;
    }
  | {
      readonly type: "test:result";
      readonly automatorId: AiAssistantId;
      readonly testName: string;
      readonly category: "selector" | "extractor" | "action" | "watcher";
      readonly result: FunctionResult | SelectorTestResult;
      readonly timestamp: string;
    }
  | {
      readonly type: "test:error";
      readonly automatorId: AiAssistantId;
      readonly testName: string;
      readonly category: "selector" | "extractor" | "action" | "watcher";
      readonly error: string;
      readonly timestamp: string;
    }
  | {
      readonly type: "selector:results";
      readonly automatorId: AiAssistantId;
      readonly results: SelectorResults;
      readonly timestamp: string;
    }
  | {
      readonly type: "automator:status";
      readonly automatorId: AiAssistantId;
      readonly status: "initializing" | "testing" | "idle" | "error";
      readonly message?: string;
      readonly timestamp: string;
    }
  | {
      readonly type: "watcher:update";
      readonly automatorId: AiAssistantId;
      readonly watcherName: string;
      readonly data: any;
      readonly timestamp: string;
    }
  | {
      readonly type: "snapshots:results";
      readonly automatorId: AiAssistantId | "none";
      readonly ariaSnapshot: string;
      readonly yamlSnapshot: string;
      readonly timestamp: string;
    };
