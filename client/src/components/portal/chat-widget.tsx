import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AIMarkdown } from "@/components/ai-markdown";
import { MessageCircle, X, Send, Loader2, Bot, User, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatWidgetProps {
  token: string;
  currentStep: number;
  stepKey: string;
  stepName: string;
}

export function ChatWidget({ token, currentStep, stepKey, stepName }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      inputRef.current?.focus();
    }
  }, [isOpen, isMinimized]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsStreaming(true);

    const assistantMessage: ChatMessage = { role: "assistant", content: "" };
    setMessages([...updatedMessages, assistantMessage]);

    try {
      const response = await fetch(`/api/portal/${token}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: messages,
          currentStep,
          stepKey,
          stepName,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          const lines = event.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.done) break;
                if (data.content) {
                  fullContent += data.content;
                  setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: "assistant", content: fullContent };
                    return updated;
                  });
                }
                if (data.error) {
                  fullContent = "I'm sorry, something went wrong. Please try again.";
                  setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: "assistant", content: fullContent };
                    return updated;
                  });
                }
              } catch {
              }
            }
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "I'm sorry, I couldn't connect to the support service. Please try again in a moment.",
        };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center hover:scale-105"
        data-testid="button-open-chat"
        aria-label="Open support chat"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }

  if (isMinimized) {
    return (
      <div
        className="fixed bottom-6 right-6 z-50 bg-primary text-primary-foreground rounded-full shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 flex items-center gap-2 px-4 py-3 hover:scale-105"
        onClick={() => setIsMinimized(false)}
        data-testid="button-restore-chat"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="text-sm font-medium">Support Chat</span>
        {messages.length > 0 && (
          <span className="bg-primary-foreground/20 text-xs px-1.5 py-0.5 rounded-full">
            {messages.length}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-4rem)] bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
      data-testid="chat-widget"
    >
      <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground border-b border-primary/20">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          <div>
            <p className="text-sm font-semibold">Onboarding Support</p>
            <p className="text-xs opacity-80">Ask about your onboarding</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20"
            onClick={() => setIsMinimized(true)}
            data-testid="button-minimize-chat"
            aria-label="Minimize chat"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20"
            onClick={() => setIsOpen(false)}
            data-testid="button-close-chat"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="chat-messages">
        {messages.length === 0 && (
          <div className="text-center py-8 space-y-3">
            <Bot className="h-10 w-10 text-muted-foreground mx-auto" />
            <div>
              <p className="text-sm font-medium">Welcome to Onboarding Support</p>
              <p className="text-xs text-muted-foreground mt-1">
                Ask me anything about your onboarding process, required documents, or next steps.
              </p>
            </div>
            <div className="space-y-2 pt-2">
              {[
                "What documents do I need?",
                "How long does onboarding take?",
                `What do I need for the ${stepName} step?`,
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion);
                    inputRef.current?.focus();
                  }}
                  className="block w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-secondary transition-colors"
                  data-testid={`button-suggestion-${suggestion.slice(0, 20).replace(/\s+/g, "-").toLowerCase()}`}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={cn(
              "flex gap-2",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}
            data-testid={`chat-message-${msg.role}-${idx}`}
          >
            {msg.role === "assistant" && (
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-4 w-4 text-primary" />
              </div>
            )}
            <div
              className={cn(
                "rounded-xl px-3 py-2 text-sm max-w-[80%] break-words",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground whitespace-pre-wrap"
                  : "bg-secondary text-foreground"
              )}
            >
              {msg.content ? (
                msg.role === "assistant" ? (
                  <AIMarkdown content={msg.content} className="prose-p:text-sm prose-li:text-sm prose-headings:text-sm" />
                ) : msg.content
              ) : (isStreaming && idx === messages.length - 1 && (
                <Loader2 className="h-4 w-4 animate-spin" />
              ))}
            </div>
            {msg.role === "user" && (
              <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-border bg-background">
        <p className="text-[10px] text-muted-foreground mb-2 text-center">
          I can answer questions but cannot make changes to your onboarding.
        </p>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your question..."
            disabled={isStreaming}
            className="text-sm"
            data-testid="input-chat-message"
          />
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
            className="shrink-0"
            data-testid="button-send-chat"
            aria-label="Send message"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
