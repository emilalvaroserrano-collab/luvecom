import { useMemo, useState, type FormEvent } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  Check,
  ChevronDown,
  Globe,
  Headphones,
  Heart,
  Languages,
  Mic,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { D3Equalizer } from "@/components/orbit/d3-equalizer";
import { useLiveTranslation } from "@/lib/live-translation";
import { TRANSLATION_LANGUAGES, type TranslationLanguage } from "@/lib/translation-languages";
import { cn } from "@/lib/cn";

const DONATION_AMOUNTS = [10, 25, 50, 100];

export function TranslatorPanel({
  active,
  mediaStream,
  shareStream,
}: {
  active: boolean;
  mediaStream: MediaStream | null;
  shareStream?: MediaStream | null;
}) {
  const [targetLanguageCode, setTargetLanguageCode] = useState("en");
  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [audioSource, setAudioSource] = useState<"auto" | "mic">("auto");
  const [customMicStream, setCustomMicStream] = useState<MediaStream | null>(null);
  const [isTranslatorRunning, setIsTranslatorRunning] = useState(false);

  // If user requests explicit mic capture, use mic stream. Otherwise prioritize shareStream if it has audio tracks, or fallback to mediaStream.
  const activeStream = useMemo(() => {
    if (audioSource === "mic" && customMicStream) return customMicStream;
    if (shareStream && shareStream.getAudioTracks().length > 0) return shareStream;
    return mediaStream;
  }, [audioSource, customMicStream, shareStream, mediaStream]);

  const { state, restart } = useLiveTranslation(activeStream, active && isTranslatorRunning, targetLanguageCode);
  const selectedLanguage = useMemo(
    () => TRANSLATION_LANGUAGES.find((item) => item.code === targetLanguageCode) ?? TRANSLATION_LANGUAGES[19],
    [targetLanguageCode],
  );

  const filteredLanguages = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return TRANSLATION_LANGUAGES;
    return TRANSLATION_LANGUAGES.filter(
      (lang) =>
        lang.name.toLowerCase().includes(query) ||
        lang.code.toLowerCase().includes(query),
    );
  }, [searchQuery]);

  async function enableMicrophoneSource() {
    try {
      if (customMicStream) {
        setAudioSource("mic");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setCustomMicStream(stream);
      setAudioSource("mic");
    } catch {
      // Fallback
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-elevated text-fg">
      {/* Language Selector Header */}
      <div className="border-b border-line p-4">
        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
          <Globe className="size-3.5 text-accent" />
          Target Language
        </label>

        <Popover.Root open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              className="mt-2.5 flex h-12 w-full items-center justify-between rounded-xl border border-strong bg-bg px-3.5 text-left text-sm text-fg transition-colors hover:border-accent/40 focus-visible:outline-none"
              aria-label="Select translation target language"
            >
              <div className="flex items-center gap-2.5 truncate">
                <span className="flex size-7 items-center justify-center rounded-lg bg-subtle text-xs font-semibold uppercase text-accent">
                  {selectedLanguage.code.slice(0, 2)}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium leading-tight">{selectedLanguage.name}</p>
                  <p className="text-xs text-faint">Code: {selectedLanguage.code}</p>
                </div>
              </div>
              <ChevronDown className={cn("size-4 text-muted transition-transform", isDropdownOpen && "rotate-180")} />
            </button>
          </Popover.Trigger>

          <Popover.Portal>
            <Popover.Content
              side="bottom"
              align="start"
              sideOffset={8}
              className="z-50 flex max-h-96 w-80 flex-col overflow-hidden rounded-2xl border border-line bg-elevated shadow-2xl animate-in fade-in-50 zoom-in-95"
            >
              <div className="border-b border-line p-2.5">
                <div className="relative flex items-center">
                  <Search className="pointer-events-none absolute left-3 size-4 text-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search 80+ languages…"
                    className="h-10 w-full rounded-lg border border-strong bg-bg pl-9 pr-3 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none"
                    autoFocus
                  />
                </div>
              </div>

              <div className="max-h-80 scroll-thin overflow-y-auto overscroll-contain p-1.5">
                {filteredLanguages.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted">No language matches &quot;{searchQuery}&quot;</p>
                ) : (
                  filteredLanguages.map((lang: TranslationLanguage) => {
                    const isSelected = lang.code === targetLanguageCode;
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => {
                          setTargetLanguageCode(lang.code);
                          setIsDropdownOpen(false);
                          setSearchQuery("");
                        }}
                        className={cn(
                          "flex h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm transition-colors",
                          isSelected
                            ? "bg-accent/15 font-semibold text-fg"
                            : "text-muted hover:bg-subtle hover:text-fg",
                        )}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span className="w-6 text-xs text-faint">{lang.code}</span>
                          <span className="truncate">{lang.name}</span>
                        </span>
                        {isSelected && <Check className="size-4 shrink-0 text-accent" />}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="border-t border-line bg-subtle/50 px-3 py-2 text-center text-[11px] text-faint">
                {TRANSLATION_LANGUAGES.length} languages supported by Gemini Live Translate
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>

      {/* Start / Stop Translator Button */}
      <div className="border-b border-line bg-subtle/30 px-4 py-3">
        <Button
          variant={isTranslatorRunning ? "secondary" : "primary"}
          size="default"
          className={cn(
            "w-full gap-2 font-medium shadow-sm transition-all",
            isTranslatorRunning
              ? "border border-danger/30 text-danger hover:bg-danger/10"
              : "bg-accent text-ink hover:opacity-90",
          )}
          onClick={() => setIsTranslatorRunning((prev) => !prev)}
        >
          <Sparkles className="size-4" />
          {isTranslatorRunning ? "Stop Translator" : "Start Translator"}
        </Button>
      </div>

      {/* Connection & Live Stream Status */}
      <div className="flex items-center justify-between border-b border-line px-4 py-3 bg-subtle/30">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative flex size-2.5 shrink-0">
            {state.status === "listening" || state.status === "playing" ? (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-75" />
            ) : null}
            <span
              className={cn(
                "relative inline-flex size-2.5 rounded-full",
                state.status === "error"
                  ? "bg-danger"
                  : state.status === "connecting"
                    ? "animate-pulse bg-amber-400"
                    : state.status === "playing"
                      ? "bg-accent"
                      : activeStream
                        ? "bg-live"
                        : "bg-faint",
              )}
            />
          </span>
          <p className="truncate text-xs font-medium text-muted">
            {!activeStream
              ? "Microphone / room audio ready"
              : state.status === "connecting"
                ? "Connecting to Gemini 3.5 Live…"
                : state.status === "playing"
                  ? `Speaking ${selectedLanguage.name}`
                  : state.status === "error"
                    ? "Translation error"
                    : `Listening & translating to ${selectedLanguage.name}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <D3Equalizer active={state.status === "playing" || state.status === "listening"} barCount={10} height={22} width={72} />
        </div>
      </div>

      {/* Content Area */}
      <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {!activeStream && (
          <div className="rounded-xl border border-line bg-subtle p-4">
            <div className="flex items-center gap-2">
              <Languages className="size-5 text-fg" />
              <h3 className="text-sm font-semibold text-fg">Real-Time Audio Translation</h3>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Live translation translates incoming participant speech and shared audio directly into {selectedLanguage.name} with natural synchronized audio output.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="w-full text-xs"
                onClick={enableMicrophoneSource}
              >
                <Mic className="size-3.5 mr-1.5" />
                Translate my voice
              </Button>
            </div>
          </div>
        )}

        {/* Real-Time Transcripts */}
        <div className="space-y-3">
          <div className="rounded-xl border border-line bg-subtle/60 p-3.5">
            <div className="flex items-center justify-between text-xs text-faint">
              <span className="font-semibold uppercase tracking-wider">Original Speech</span>
              <Headphones className="size-3.5" />
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted select-text">
              {state.sourceText || (activeStream ? "Listening for speech…" : "Waiting for audio track…")}
            </p>
          </div>

          <div className="rounded-xl border border-strong bg-subtle p-3.5">
            <div className="flex items-center justify-between text-xs text-accent">
              <span className="font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="size-3.5" />
                {selectedLanguage.name} Translation
              </span>
              <span className="text-[11px] text-faint">Live Output</span>
            </div>
            <p className="mt-2 text-sm font-medium leading-relaxed text-fg select-text">
              {state.translatedText || "Translated speech will appear here in real time."}
            </p>
          </div>
        </div>

        {/* Error State */}
        {state.error && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-3.5">
            <p className="text-xs font-medium text-danger">{state.error}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 w-full text-xs"
              onClick={restart}
            >
              <RotateCcw className="size-3.5 mr-1.5" />
              Reconnect live translator
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function DonatePanel({ returnPath }: { returnPath: string }) {
  const [amount, setAmount] = useState(25);
  const [customAmount, setCustomAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedAmount = customAmount ? Number(customAmount) : amount;

  async function donate(event: FormEvent) {
    event.preventDefault();
    if (!Number.isInteger(selectedAmount) || selectedAmount < 5 || selectedAmount > 500) {
      setError("Choose an amount from $5 to $500.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/donate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: selectedAmount, returnPath }),
      });
      const payload = (await response.json()) as { mode?: "demo" | "live"; url?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Checkout could not be created.");
      if (payload.mode === "live" && payload.url) {
        window.location.assign(payload.url);
        return;
      }
      setMessage(`Demo donation of $${selectedAmount} prepared. No payment was taken.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Checkout could not be created.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={donate} className="scroll-thin h-full overflow-y-auto p-4">
      <div className="rounded-xl border border-line bg-subtle p-4">
        <Heart className="size-5 text-fg" />
        <h3 className="mt-3 text-base font-medium">Support Orbit</h3>
        <p className="mt-1 text-sm leading-normal text-muted">
          Help keep simple, private meetings open to everyone.
        </p>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium">Donation amount</legend>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {DONATION_AMOUNTS.map((value) => (
            <Button
              key={value}
              type="button"
              variant={!customAmount && amount === value ? "primary" : "secondary"}
              onClick={() => {
                setAmount(value);
                setCustomAmount("");
                setMessage(null);
              }}
            >
              ${value}
            </Button>
          ))}
        </div>
        <label className="mt-3 grid gap-2 text-sm font-medium" htmlFor="custom-donation">
          Custom amount
          <span className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
            <input
              id="custom-donation"
              type="number"
              inputMode="numeric"
              min={5}
              max={500}
              value={customAmount}
              onChange={(event) => {
                setCustomAmount(event.target.value);
                setMessage(null);
              }}
              placeholder="25"
              className="h-12 w-full rounded-md border border-strong bg-bg pl-7 pr-3 text-base text-fg outline-none placeholder:text-faint"
            />
          </span>
        </label>
      </fieldset>

      <Button type="submit" variant="primary" size="lg" className="mt-5 w-full" disabled={loading}>
        {loading ? "Opening checkout…" : `Donate $${Number.isFinite(selectedAmount) ? selectedAmount : 0}`}
      </Button>

      {message && (
        <p role="status" className="mt-3 rounded-md border border-line bg-subtle p-3 text-sm leading-normal text-muted">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-md border border-line bg-subtle p-3 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
