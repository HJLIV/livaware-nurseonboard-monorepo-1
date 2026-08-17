// @vitest-environment jsdom
// UI regression tests for the task-212 completion form. The completion code
// review caught that PromptEntry originally registered a `getText` closure
// capturing mount-time state — typed answers would submit as empty strings
// and the server would (correctly) reject the submission. These tests render
// the real PromptEntry components in jsdom, type into them like a nurse
// would, and assert the parent-visible handles return the current text with
// intact paste-blocking and integrity telemetry.

import { describe, it, expect, beforeAll } from "vitest";
import React, { useCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import {
  PromptEntry,
  type PromptEntryHandle,
} from "../client/src/pages/portal/assigned-action";
import type { AssignedActionPrompt } from "../shared/schema";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

// jsdom ships InputEvent (>= 22), but polyfill defensively so the test keeps
// working if the environment changes — the hook's synthetic-injection guard
// keys on `instanceof InputEvent`.
if (typeof window !== "undefined" && typeof window.InputEvent === "undefined") {
  class FakeInputEvent extends Event {
    inputType?: string;
    data?: string | null;
    constructor(type: string, init?: EventInit & { inputType?: string; data?: string }) {
      super(type, init);
      this.inputType = init?.inputType;
      this.data = init?.data ?? null;
    }
  }
  (window as any).InputEvent = FakeInputEvent;
  (globalThis as any).InputEvent = FakeInputEvent;
}

const PROMPT_A: AssignedActionPrompt = {
  key: "description",
  title: "Description",
  prompt: "What happened?",
};
const PROMPT_B: AssignedActionPrompt = {
  key: "feelings",
  title: "Feelings",
  prompt: "What were you thinking and feeling?",
};

/** Mirrors the CompletionForm registration contract: a stable register
 *  callback feeding a parent-owned handle map. */
function Harness({ handles }: { handles: Map<string, PromptEntryHandle> }) {
  const register = useCallback(
    (key: string, handle: PromptEntryHandle | null) => {
      if (handle) handles.set(key, handle);
      else handles.delete(key);
    },
    [handles],
  );
  return (
    <>
      <PromptEntry prompt={PROMPT_A} index={0} disabled={false} register={register} />
      <PromptEntry prompt={PROMPT_B} index={1} disabled={false} register={register} />
    </>
  );
}

const valueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLTextAreaElement.prototype,
  "value",
)!.set!;

function typeText(el: HTMLTextAreaElement, text: string) {
  for (const ch of text) {
    act(() => {
      el.dispatchEvent(new window.KeyboardEvent("keydown", { key: ch, bubbles: true }));
      valueSetter.call(el, el.value + ch);
      el.dispatchEvent(
        new window.InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: ch,
        }),
      );
    });
  }
}

function pasteText(el: HTMLTextAreaElement, text: string) {
  act(() => {
    valueSetter.call(el, el.value + text);
    el.dispatchEvent(
      new window.InputEvent("input", {
        bubbles: true,
        inputType: "insertFromPaste",
        data: text,
      }),
    );
  });
}

function mount(handles: Map<string, PromptEntryHandle>): { root: Root; container: HTMLDivElement } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Harness handles={handles} />);
  });
  return { root, container };
}

function unmount(root: Root, container: HTMLDivElement) {
  act(() => {
    root.unmount();
  });
  container.remove();
}

describe("Assigned-action completion form (task 212 review fixes)", () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  it("hands the parent the CURRENT typed text for every prompt", () => {
    const handles = new Map<string, PromptEntryHandle>();
    const { root, container } = mount(handles);

    const taA = container.querySelector<HTMLTextAreaElement>("#prompt-input-description")!;
    const taB = container.querySelector<HTMLTextAreaElement>("#prompt-input-feelings")!;
    expect(taA).toBeTruthy();
    expect(taB).toBeTruthy();

    typeText(taA, "I was on shift when it happened.");
    typeText(taB, "I felt responsible.");

    // This is the regression the review caught: getText must not be a stale
    // mount-time closure.
    expect(handles.get("description")!.getText()).toBe("I was on shift when it happened.");
    expect(handles.get("feelings")!.getText()).toBe("I felt responsible.");

    unmount(root, container);
  });

  it("blocks paste, keeps the typed text, and counts the attempt", () => {
    const handles = new Map<string, PromptEntryHandle>();
    const { root, container } = mount(handles);

    const taA = container.querySelector<HTMLTextAreaElement>("#prompt-input-description")!;
    typeText(taA, "typed");
    pasteText(taA, "PASTED AI CONTENT THAT MUST NOT LAND");

    const handle = handles.get("description")!;
    expect(handle.getText()).toBe("typed");
    expect(handle.getTelemetry().pasteAttempts).toBe(1);
    expect(container.querySelector('[data-testid="text-paste-blocked-description"]')).toBeTruthy();

    unmount(root, container);
  });

  it("records keystroke and burst telemetry as the nurse types", () => {
    const handles = new Map<string, PromptEntryHandle>();
    const { root, container } = mount(handles);

    const taB = container.querySelector<HTMLTextAreaElement>("#prompt-input-feelings")!;
    typeText(taB, "hello");

    const t = handles.get("feelings")!.getTelemetry();
    expect(t.keystrokeCount).toBeGreaterThanOrEqual(5);
    expect(t.maxBurstChars).toBe(1); // single-char inserts only
    expect(t.pasteAttempts).toBe(0);

    unmount(root, container);
  });

  it("hides the dictate button when the browser lacks SpeechRecognition", () => {
    const handles = new Map<string, PromptEntryHandle>();
    const { root, container } = mount(handles);
    // jsdom has no SpeechRecognition — graceful degradation path.
    expect(container.querySelector('[data-testid="button-dictate-description"]')).toBeNull();
    unmount(root, container);
  });
});
