// Invisible reading-time tracker for the nurse-facing policies page.
//
// Per (nurse, policy, version) we sum visible time across multiple
// sessions, gated on:
//   - the policy card being in the viewport (IntersectionObserver),
//   - the document being visible (visibilitychange),
//   - the window having focus (blur/focus),
//   - and the user not being idle (no input for IDLE_MS).
//
// Events are batched and POSTed in the background via sendBeacon on
// pagehide / visibilitychange=hidden, plus a periodic flush. The nurse
// sees no UI from this — admin-only signal.

import { useEffect, useRef } from "react";

const IDLE_MS = 60_000;
const PERIODIC_FLUSH_MS = 30_000;
// Slice an open session every 5 minutes so a long, uninterrupted read
// still gets persisted in chunks rather than being lost if the tab is
// killed without firing pagehide.
const SESSION_SLICE_MS = 5 * 60_000;

type EventType = "session" | "pdf_open" | "scroll_end";
interface PendingEvent {
  type: EventType;
  durationMs?: number;
  sessionId?: string;
}

interface TrackerArgs {
  token: string | undefined;
  policyId: string;
  enabled: boolean;
  cardRef: React.RefObject<HTMLElement | null>;
  bodyRef: React.RefObject<HTMLElement | null>;
}

export interface PolicyReadEventPayload {
  type: EventType;
  durationMs?: number;
  sessionId?: string;
}

interface TrackerHandle {
  notePdfOpen: () => void;
  /**
   * Drain the pending event queue (closing any open session) and return
   * the events synchronously so the caller can include them in a
   * follow-up request body — used by the acknowledge flow to avoid a
   * race against fire-and-forget sendBeacon posts.
   */
  drainPending: () => PolicyReadEventPayload[];
  flushNow: () => void;
}

function postEvents(token: string, policyId: string, events: PendingEvent[]) {
  if (!events.length) return;
  const url = `/api/portal/${token}/policies/${policyId}/read-events`;
  const body = JSON.stringify({ events });
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) return;
    }
  } catch {
    // fall through to fetch
  }
  // Fallback for browsers without sendBeacon or when it returns false.
  fetch(url, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    keepalive: true,
  }).catch(() => {});
}

export function usePolicyReadTracking({
  token,
  policyId,
  enabled,
  cardRef,
  bodyRef,
}: TrackerArgs): TrackerHandle {
  const handleRef = useRef<TrackerHandle>({
    notePdfOpen: () => {},
    drainPending: () => [],
    flushNow: () => {},
  });

  useEffect(() => {
    if (!token || !enabled) {
      handleRef.current = {
        notePdfOpen: () => {},
        drainPending: () => [],
        flushNow: () => {},
      };
      return;
    }

    // A new sessionId is minted each time a session opens (see openSession),
    // so the server can count distinct session runs rather than the number
    // of slice rows produced by long uninterrupted reads. The "lifetime"
    // id below is only used for non-session signals (pdf_open, scroll_end)
    // so they can still be correlated to a viewing context if needed.
    const lifetimeId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    let currentSessionId: string | null = null;
    const newSessionId = () =>
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const queue: PendingEvent[] = [];
    let inViewport = false;
    let docVisible = typeof document !== "undefined" ? !document.hidden : true;
    let windowFocused = typeof document !== "undefined" ? document.hasFocus() : true;
    let lastInteractionAt = Date.now();
    let openedAt: number | null = null;
    let scrolledToEndSent = false;
    let pdfOpenSent = false;
    let disposed = false;

    const isActive = () =>
      inViewport
      && docVisible
      && windowFocused
      && Date.now() - lastInteractionAt < IDLE_MS;

    const flushQueue = () => {
      if (queue.length === 0) return;
      const batch = queue.splice(0, queue.length);
      postEvents(token, policyId, batch);
    };

    const closeSession = (reason: "natural" | "slice") => {
      if (openedAt == null || currentSessionId == null) return;
      const duration = Date.now() - openedAt;
      const sid = currentSessionId;
      openedAt = null;
      if (reason === "natural") currentSessionId = null;
      if (duration >= 1000) {
        // All slices of one uninterrupted run share the same sessionId so
        // the server can count distinct sessions, not slice rows.
        queue.push({ type: "session", durationMs: duration, sessionId: sid });
      }
      if (reason === "slice") {
        // Reopen immediately so the run continues seamlessly under the
        // same sessionId.
        openedAt = Date.now();
      }
    };

    const openSession = () => {
      openedAt = Date.now();
      currentSessionId = newSessionId();
    };

    const reconcile = () => {
      if (disposed) return;
      const active = isActive();
      if (active && openedAt == null) {
        openSession();
      } else if (!active && openedAt != null) {
        closeSession("natural");
      } else if (active && openedAt != null && Date.now() - openedAt >= SESSION_SLICE_MS) {
        closeSession("slice");
      }
    };

    const noteInteraction = () => {
      const wasIdle = Date.now() - lastInteractionAt >= IDLE_MS;
      lastInteractionAt = Date.now();
      if (wasIdle) reconcile();
    };

    // Viewport observer.
    let observer: IntersectionObserver | null = null;
    if (cardRef.current && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            inViewport = e.isIntersecting && e.intersectionRatio > 0.25;
          }
          reconcile();
        },
        { threshold: [0, 0.25, 0.5, 1] },
      );
      observer.observe(cardRef.current);
    } else {
      inViewport = true;
    }

    const onVisibility = () => {
      docVisible = !document.hidden;
      if (document.hidden) {
        closeSession("natural");
        flushQueue();
      } else {
        lastInteractionAt = Date.now();
      }
      reconcile();
    };
    const onFocus = () => {
      windowFocused = true;
      lastInteractionAt = Date.now();
      reconcile();
    };
    const onBlur = () => {
      windowFocused = false;
      reconcile();
    };
    const onPageHide = () => {
      closeSession("natural");
      flushQueue();
    };

    // Scroll-to-end detection on the policy body.
    const onBodyScroll = () => {
      const el = bodyRef.current;
      if (!el || scrolledToEndSent) return;
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (remaining <= 8) {
        scrolledToEndSent = true;
        queue.push({ type: "scroll_end", sessionId: lifetimeId });
      }
    };
    // Also handle the case where the body is short enough that it doesn't
    // need scrolling — treat that as "scrolled to end" the moment it
    // becomes visible.
    const checkShortBody = () => {
      const el = bodyRef.current;
      if (!el || scrolledToEndSent) return;
      if (el.scrollHeight <= el.clientHeight + 8 && inViewport) {
        scrolledToEndSent = true;
        queue.push({ type: "scroll_end", sessionId: lifetimeId });
      }
    };

    // Wire up listeners.
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pagehide", onPageHide);
    const interactionEvents: (keyof DocumentEventMap)[] = [
      "mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel",
    ];
    for (const evt of interactionEvents) {
      document.addEventListener(evt, noteInteraction, { passive: true });
    }
    if (bodyRef.current) {
      bodyRef.current.addEventListener("scroll", onBodyScroll, { passive: true });
    }

    // Periodic flush + reconcile to catch idle transitions and slice long sessions.
    const interval = window.setInterval(() => {
      reconcile();
      checkShortBody();
      flushQueue();
    }, PERIODIC_FLUSH_MS);

    // Initial reconcile after mount (let layout settle).
    const initialTimer = window.setTimeout(() => {
      reconcile();
      checkShortBody();
    }, 250);

    handleRef.current = {
      notePdfOpen: () => {
        if (pdfOpenSent) return;
        pdfOpenSent = true;
        queue.push({ type: "pdf_open", sessionId: lifetimeId });
        flushQueue();
      },
      drainPending: () => {
        // Close any open session and return everything still in the queue.
        // The caller takes responsibility for delivering these events
        // (typically by including them in the acknowledge POST body).
        closeSession("natural");
        return queue.splice(0, queue.length).map((e) => ({ ...e }));
      },
      flushNow: () => {
        closeSession("natural");
        flushQueue();
      },
    };

    return () => {
      disposed = true;
      closeSession("natural");
      flushQueue();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onPageHide);
      for (const evt of interactionEvents) {
        document.removeEventListener(evt, noteInteraction);
      }
      if (bodyRef.current) {
        bodyRef.current.removeEventListener("scroll", onBodyScroll);
      }
      window.clearInterval(interval);
      window.clearTimeout(initialTimer);
      handleRef.current = {
        notePdfOpen: () => {},
        drainPending: () => [],
        flushNow: () => {},
      };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, policyId, enabled]);

  return {
    notePdfOpen: () => handleRef.current.notePdfOpen(),
    drainPending: () => handleRef.current.drainPending(),
    flushNow: () => handleRef.current.flushNow(),
  };
}
