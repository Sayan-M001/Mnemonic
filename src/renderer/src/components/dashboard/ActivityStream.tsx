import { useState, useEffect } from "react";
import type { DebugSnapshot, CaptureEvent, ActivitySegment } from "../../../../shared/types";

interface ActivityStreamProps {
  snapshot: DebugSnapshot | null;
}

export function ActivityStream({ snapshot }: ActivityStreamProps) {
  const [activeSubTab, setActiveSubTab] = useState<"segments" | "raw">("segments");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [expandedSegmentId, setExpandedSegmentId] = useState<string | null>(null);

  const events = snapshot?.events ?? [];
  const segments = snapshot?.segments ?? [];

  // Filter events based on query
  const filteredEvents = events.filter((event) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const app = event.metadata?.appName?.toLowerCase() || "";
    const title = event.metadata?.windowTitle?.toLowerCase() || "";
    const content = event.content?.toLowerCase() || "";
    const ocr = event.metadata?.ocrText?.toLowerCase() || "";
    return app.includes(query) || title.includes(query) || content.includes(query) || ocr.includes(query);
  });

  // Filter segments based on query
  const filteredSegments = segments.filter((segment) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const title = segment.title?.toLowerCase() || "";
    const summary = segment.summary?.toLowerCase() || "";
    const surface = segment.surfaceType?.toLowerCase() || "";
    const activity = segment.activityKind?.toLowerCase() || "";
    return title.includes(query) || summary.includes(query) || surface.includes(query) || activity.includes(query);
  });

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "--:--:--";
    return new Date(isoString).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  };

  const getLocalDate = (isoString?: string | null) => {
    if (!isoString) return "";
    return new Date(isoString).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    });
  };

  return (
    <div className="flex-1 flex flex-col p-8 overflow-hidden max-h-full">
      {/* View Header */}
      <header className="flex-shrink-0 flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-serif font-black tracking-tight text-white leading-tight">
            Activity Stream
          </h2>
          <p className="text-neutral-400 text-xs font-semibold mt-1">
            Browse through Mnemonic's locally-indexed semantic segments and raw events.
          </p>
        </div>
      </header>

      {/* Filter and Tab Controller */}
      <div className="flex-shrink-0 flex flex-col sm:flex-row gap-4 justify-between items-center bg-white/[0.02] border border-white/5 p-3 rounded-2xl mb-6">
        <div className="flex items-center gap-1.5 bg-neutral-900 border border-white/5 rounded-lg p-0.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab("segments")}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-md text-xs font-extrabold cursor-pointer transition-all ${
              activeSubTab === "segments"
                ? "bg-white/10 text-white shadow-sm"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            Activity Segments ({filteredSegments.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("raw")}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-md text-xs font-extrabold cursor-pointer transition-all ${
              activeSubTab === "raw"
                ? "bg-white/10 text-white shadow-sm"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            Raw Captures ({filteredEvents.length})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-[260px] flex items-center">
          <svg className="w-4 h-4 text-neutral-500 absolute left-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search records..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-900 border border-white/5 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 outline-none focus:border-[#eb7f4b]/30 transition-all font-semibold"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 text-neutral-500 hover:text-neutral-300 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Main List Scroller */}
      <div className="flex-1 overflow-y-auto pr-1 select-text space-y-4">
        {activeSubTab === "segments" ? (
          filteredSegments.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center bg-white/[0.01] rounded-3xl border border-dashed border-white/5 py-12">
              <svg className="w-8 h-8 text-neutral-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
                No Activity Segments
              </span>
              <p className="text-[10px] text-neutral-600 max-w-sm mt-1 px-4">
                Segments group related events over 15-minute cycles. Let the daemon run or click "Run capture" in the dashboard.
              </p>
            </div>
          ) : (
            filteredSegments.map((segment) => {
              const isExpanded = expandedSegmentId === segment.id;
              return (
                <article
                  key={segment.id}
                  className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 transition-all duration-300 hover:border-white/10"
                >
                  <div
                    onClick={() => setExpandedSegmentId(isExpanded ? null : segment.id)}
                    className="flex justify-between items-start gap-4 cursor-pointer"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-[#eb7f4b] uppercase tracking-wider bg-[#eb7f4b]/5 border border-[#eb7f4b]/15 px-2 py-0.5 rounded-md">
                          Segment
                        </span>
                        <span className="text-[10px] text-neutral-500 font-bold">
                          {getLocalDate(segment.windowEndAt)} • {formatDate(segment.windowStartAt)} - {formatDate(segment.windowEndAt)}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-white mt-2 font-serif">
                        {segment.title || "Grouped Event Cycle"}
                      </h3>
                      <p className="text-neutral-400 text-xs mt-1.5 leading-relaxed">
                        {segment.summary}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <span className="text-[9px] font-extrabold uppercase text-[#39706f] bg-[#39706f]/10 border border-[#39706f]/20 px-2 py-0.5 rounded-full">
                        {Math.round(segment.confidence * 100)}% Match
                      </span>
                      <svg className={`w-4 h-4 text-neutral-500 transition-transform duration-200 ${isExpanded ? "transform rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-white/5 text-xs text-neutral-300 space-y-3.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <strong className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">Surface type</strong>
                          <span className="bg-neutral-800 text-neutral-300 px-2 py-1 rounded text-[11px] font-semibold">{segment.surfaceType}</span>
                        </div>
                        <div>
                          <strong className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">Activity kind</strong>
                          <span className="bg-neutral-800 text-neutral-300 px-2 py-1 rounded text-[11px] font-semibold">{segment.activityKind}</span>
                        </div>
                      </div>

                      {segment.topicHints?.length > 0 && (
                        <div>
                          <strong className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">Topics</strong>
                          <div className="flex flex-wrap gap-1.5">
                            {segment.topicHints.map((hint) => (
                              <span key={hint} className="bg-neutral-900 border border-white/5 text-neutral-300 px-2 py-0.5 rounded-md text-[10px] font-bold">
                                {hint}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {segment.entities?.length > 0 && (
                        <div>
                          <strong className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">Entities captured</strong>
                          <div className="flex flex-wrap gap-1.5">
                            {segment.entities.map((ent) => (
                              <span key={ent} className="bg-neutral-900 border border-[#39706f]/20 text-[#39706f] px-2 py-0.5 rounded-md text-[10px] font-bold">
                                {ent}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })
          )
        ) : (
          filteredEvents.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center bg-white/[0.01] rounded-3xl border border-dashed border-white/5 py-12">
              <svg className="w-8 h-8 text-neutral-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
                No Raw Captures
              </span>
              <p className="text-[10px] text-neutral-600 max-w-sm mt-1 px-4">
                No screenshot or clipboard events logged. Enable sources in settings and wait or click capture!
              </p>
            </div>
          ) : (
            filteredEvents.map((event) => {
              const isExpanded = expandedEventId === event.id;
              return (
                <article
                  key={event.id}
                  className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 transition-all duration-300 hover:border-white/10"
                >
                  <div
                    onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                    className="flex justify-between items-start gap-4 cursor-pointer"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          event.source === "clipboard"
                            ? "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                            : "bg-blue-500/10 border border-blue-500/20 text-blue-400"
                        }`}>
                          {event.source}
                        </span>
                        <span className="text-[10px] text-neutral-500 font-bold">
                          {getLocalDate(event.capturedAt)} • {formatDate(event.capturedAt)}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-white mt-2">
                        {event.metadata?.appName || (event.source === "clipboard" ? "Clipboard Copy" : "System Capture")}
                      </h3>
                      <p className="text-neutral-400 text-xs mt-1 truncate max-w-full font-medium">
                        {event.metadata?.windowTitle || event.content}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <span className="text-[9px] font-extrabold uppercase text-neutral-400">
                        Sens: {event.sensitivity}
                      </span>
                      <svg className={`w-4 h-4 text-neutral-500 transition-transform duration-200 ${isExpanded ? "transform rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-white/5 text-xs text-neutral-300 space-y-4">
                      {event.content && (
                        <div>
                          <strong className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">Captured content</strong>
                          <div className="bg-neutral-900 border border-white/5 rounded-xl p-3 font-medium text-neutral-300 break-words whitespace-pre-wrap leading-relaxed max-h-[160px] overflow-y-auto">
                            {event.content}
                          </div>
                        </div>
                      )}

                      {/* Display app details */}
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-neutral-900/30 p-3 rounded-xl border border-white/5">
                        {event.metadata?.windowTitle && (
                          <div>
                            <dt className="text-[10px] text-neutral-500 uppercase tracking-wider font-extrabold">Window title</dt>
                            <dd className="text-neutral-200 mt-0.5 truncate font-semibold">{event.metadata.windowTitle}</dd>
                          </div>
                        )}
                        {event.metadata?.url && (
                          <div>
                            <dt className="text-[10px] text-neutral-500 uppercase tracking-wider font-extrabold">URL</dt>
                            <dd className="mt-0.5 font-semibold">
                              <a
                                href={event.metadata.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#39706f] hover:underline"
                              >
                                {event.metadata.url}
                              </a>
                            </dd>
                          </div>
                        )}
                        {event.metadata?.tabTitle && (
                          <div>
                            <dt className="text-[10px] text-neutral-500 uppercase tracking-wider font-extrabold">Tab title</dt>
                            <dd className="text-neutral-200 mt-0.5 truncate font-semibold">{event.metadata.tabTitle}</dd>
                          </div>
                        )}
                        {event.metadata?.uiText && (
                          <div className="col-span-1 sm:col-span-2">
                            <dt className="text-[10px] text-neutral-500 uppercase tracking-wider font-extrabold">UI hierarchy text</dt>
                            <dd className="bg-neutral-900 text-neutral-400 p-2 rounded-lg mt-1 max-h-[100px] overflow-y-auto font-mono text-[10px] leading-normal">
                              {event.metadata.uiText}
                            </dd>
                          </div>
                        )}
                        {event.metadata?.ocrText && (
                          <div className="col-span-1 sm:col-span-2">
                            <dt className="text-[10px] text-neutral-500 uppercase tracking-wider font-extrabold">OCR Text</dt>
                            <dd className="bg-neutral-900 border border-[#39706f]/10 text-neutral-300 p-2.5 rounded-lg mt-1 max-h-[120px] overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-normal">
                              {event.metadata.ocrText}
                            </dd>
                          </div>
                        )}
                      </dl>

                      {/* Render screenshot preview */}
                      {event.metadata?.screenshotPath && (
                        <div className="flex flex-col gap-2">
                          <strong className="text-[10px] text-neutral-500 uppercase tracking-wider">Screenshot Attachment</strong>
                          <div className="p-3 bg-neutral-900/50 rounded-xl border border-white/5 max-w-sm">
                            <ImageAssetPreview imagePath={event.metadata.screenshotPath} source={event.source} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })
          )
        )}
      </div>
    </div>
  );
}

function ImageAssetPreview({ imagePath, source }: { imagePath: string; source: CaptureEvent["source"] }) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let active = true;

    setImageSrc(null);
    setLoadError(null);
    setIsLoading(true);

    window.mnemonic
      .readImageAsset(imagePath)
      .then((src) => {
        if (active) {
          setImageSrc(src);
          setIsLoading(false);
        }
      })
      .catch((error) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Preview unavailable");
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [imagePath]);

  const handleOpenNative = () => {
    void window.mnemonic.openImageAsset(imagePath);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <button
        onClick={handleOpenNative}
        type="button"
        className="text-[10px] font-extrabold text-[#39706f] hover:underline flex items-center gap-1.5 cursor-pointer text-left"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        <span>Open captured preview in OS viewer</span>
      </button>

      <div className="relative rounded-lg overflow-hidden border border-white/10 bg-neutral-950 flex items-center justify-center min-h-[140px]">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-950">
            <svg className="animate-spin h-5 w-5 text-neutral-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        )}
        {imageSrc && (
          <img
            alt={`Captured preview for ${source}`}
            src={imageSrc}
            className="w-full h-auto object-contain max-h-[220px]"
          />
        )}
        {loadError && (
          <div className="p-4 text-center text-[10px] font-bold text-rose-500">
            {loadError}
          </div>
        )}
      </div>
    </div>
  );
}
