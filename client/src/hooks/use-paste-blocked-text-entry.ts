// Shared paste-locked text entry with integrity telemetry + dictation
// (extracted from the preboard assessment, task 212).
//
// Used by both the preboard clinical assessment and the assigned-action
// (reflection / witness statement) completion page so both surfaces share
// IDENTICAL behaviour:
//   - paste / drop / cut / copy / context-menu / middle-click blocked
//   - synthetic `input` events (script-injected values) rejected
//   - paste attempts counted, keystrokes counted, largest single text
//     burst recorded (a burst = one change adding N chars — typing adds
//     ~1, dictation adds a whole transcript chunk, a paste would add a
//     lot if it ever got through)
//   - optional real-time browser SpeechRecognition dictation; final
//     transcript chunks insert as trusted text and count as bursts
//
// The hook owns all state; consumers render their own textarea (spread
// `textareaProps`), voice button, and paste-blocked notice so each surface
// keeps its own styling.
import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";

const BLOCKED_INPUT_TYPES = new Set<string>([
  "insertFromPaste",
  "insertFromPasteAsQuotation",
  "insertFromDrop",
  "insertFromYank",
  "insertReplacementText",
]);

export interface PasteBlockedTelemetry {
  pasteAttempts: number;
  keystrokeCount: number;
  maxBurstChars: number;
}

// Minimal structural type for the Web Speech API — the project's tsconfig
// DOM lib has no SpeechRecognition declarations, so we avoid the global
// names entirely.
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

export interface UsePasteBlockedTextEntryOptions {
  /** When true the entry is read-only (e.g. after submit). */
  disabled?: boolean;
  /** BCP-47 language for dictation. Default "en-GB". */
  speechLang?: string;
}

export function usePasteBlockedTextEntry(opts: UsePasteBlockedTextEntryOptions = {}) {
  const { disabled = false, speechLang = "en-GB" } = opts;

  const [text, setText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [pasteBlocked, setPasteBlocked] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const pasteNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pasteAttemptsRef = useRef(0);
  const keystrokeCountRef = useRef(0);
  const maxBurstCharsRef = useRef(0);
  // Handlers read `disabled` through a ref so they never go stale.
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const recordTextChunk = useCallback((added: number) => {
    if (added > maxBurstCharsRef.current) {
      maxBurstCharsRef.current = added;
    }
  }, []);

  const flashPasteBlocked = useCallback(() => {
    pasteAttemptsRef.current += 1;
    setPasteBlocked(true);
    if (pasteNoticeTimerRef.current) clearTimeout(pasteNoticeTimerRef.current);
    pasteNoticeTimerRef.current = setTimeout(() => setPasteBlocked(false), 2400);
  }, []);

  useEffect(() => {
    return () => {
      if (pasteNoticeTimerRef.current) clearTimeout(pasteNoticeTimerRef.current);
    };
  }, []);

  // ─── Dictation (browser SpeechRecognition) ──────────────────────────
  useEffect(() => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    setSpeechSupported(true);
    const recognition: SpeechRecognitionLike = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = speechLang;

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          const trimmedTranscript = String(transcript).trim();
          if (!trimmedTranscript) continue;
          setText((prev) => {
            const spacer =
              prev.length > 0 && !prev.endsWith(" ") && !prev.endsWith("\n") ? " " : "";
            return prev + spacer + trimmedTranscript;
          });
          recordTextChunk(trimmedTranscript.length);
        }
      }
    };

    recognition.onerror = (event: any) => {
      if (event?.error !== "aborted" && event?.error !== "no-speech") {
        console.warn("Speech recognition error:", event?.error);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          /* already stopped */
        }
        recognitionRef.current = null;
      }
    };
  }, [speechLang, recordTextChunk]);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current || disabledRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* already stopped */
      }
    }
    setIsListening(false);
  }, []);

  // ─── Textarea handlers ───────────────────────────────────────────────
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (disabledRef.current) return;
      const native = e.nativeEvent as Event;
      const nextValue = e.target.value;
      const inputType =
        typeof InputEvent !== "undefined" && native instanceof InputEvent
          ? (native as InputEvent).inputType
          : undefined;
      if (typeof inputType === "string" && BLOCKED_INPUT_TYPES.has(inputType)) {
        flashPasteBlocked();
        if (textareaRef.current) textareaRef.current.value = text;
        return;
      }
      // If the change didn't come from a real InputEvent (e.g. a script
      // dispatched a synthetic `input` Event after mutating .value) and
      // the value actually changed, treat it as an injection attempt.
      if (
        inputType === undefined &&
        typeof InputEvent !== "undefined" &&
        nextValue !== text
      ) {
        flashPasteBlocked();
        if (textareaRef.current) textareaRef.current.value = text;
        return;
      }
      const delta = nextValue.length - text.length;
      if (delta > 0) recordTextChunk(delta);
      setText(nextValue);
    },
    [text, flashPasteBlocked, recordTextChunk],
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (disabledRef.current) return;
    if (
      e.key.length === 1 ||
      e.key === "Backspace" ||
      e.key === "Delete" ||
      e.key === "Enter" ||
      e.key === "Tab"
    ) {
      keystrokeCountRef.current += 1;
    }
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      e.preventDefault();
      flashPasteBlocked();
    },
    [flashPasteBlocked],
  );
  const handleCut = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
  }, []);
  const handleCopy = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
  }, []);
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault();
      flashPasteBlocked();
    },
    [flashPasteBlocked],
  );
  const handleDragOver = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
  }, []);
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
  }, []);
  const handleBeforeInput = useCallback(
    (e: React.FormEvent<HTMLTextAreaElement>) => {
      const inputType = (e.nativeEvent as InputEvent).inputType;
      if (typeof inputType === "string" && BLOCKED_INPUT_TYPES.has(inputType)) {
        e.preventDefault();
        flashPasteBlocked();
      }
    },
    [flashPasteBlocked],
  );
  const blockMiddleClick = useCallback(
    (e: React.MouseEvent<HTMLTextAreaElement>) => {
      if (e.button === 1) {
        e.preventDefault();
        flashPasteBlocked();
      }
    },
    [flashPasteBlocked],
  );

  const textareaProps = {
    ref: textareaRef,
    value: text,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    onPaste: handlePaste,
    onCut: handleCut,
    onCopy: handleCopy,
    onDrop: handleDrop,
    onDragOver: handleDragOver,
    onContextMenu: handleContextMenu,
    onBeforeInput: handleBeforeInput,
    onAuxClick: blockMiddleClick,
    onMouseDown: blockMiddleClick,
    autoComplete: "off",
    autoCorrect: "off",
    spellCheck: false,
  } as const;

  const getTelemetry = useCallback((): PasteBlockedTelemetry => {
    return {
      pasteAttempts: pasteAttemptsRef.current,
      keystrokeCount: keystrokeCountRef.current,
      maxBurstChars: maxBurstCharsRef.current,
    };
  }, []);

  /** Clear the text + telemetry (e.g. when switching between actions). */
  const reset = useCallback(() => {
    stopListening();
    setText("");
    setPasteBlocked(false);
    pasteAttemptsRef.current = 0;
    keystrokeCountRef.current = 0;
    maxBurstCharsRef.current = 0;
  }, [stopListening]);

  return {
    text,
    textareaRef,
    textareaProps,
    pasteBlocked,
    isListening,
    speechSupported,
    toggleListening,
    stopListening,
    getTelemetry,
    reset,
  };
}
