"use client";

import { useState, useRef, useEffect } from "react";
import { MESSAGES } from "@/lib/messages";

type SearchMode = "rag" | "okf" | "compare";

type OKFSource = {
  filename: string;
  title: string;
  type: string;
  description: string;
};

type Message = {
  role: "user" | "bot";
  text: string;
  timestamp?: string;
  // RAG sources
  sources?: Array<{ pageContent: string; pageNumber: number | string }>;
  // OKF sources
  okfSources?: OKFSource[];
  // Compare mode
  ragAnswer?: string;
  okfAnswer?: string;
  ragSources?: Array<{ pageContent: string; pageNumber: number | string }>;
  isCompare?: boolean;
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState("No PDF uploaded");
  const [isUploading, setIsUploading] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedModel, setSelectedModel] = useState("phi3:mini");
  const [openPanels, setOpenPanels] = useState<Record<number, boolean>>({});
  const [isOnlineMode, setIsOnlineMode] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>("rag");

  const togglePanel = (idx: number) => {
    setOpenPanels(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const MODELS = [
    { id: "gemma4", label: "Gemma 4" },
    { id: "phi3:mini", label: "Phi-3 Mini" },
  ];
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isAsking]);

  async function checkStatus() {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      setStatus(data.indexed ? "PDF Indexed ✅" : "No PDF uploaded ❌");
    } catch (err) {
      setStatus("Failed to check status");
    }
  }

  useEffect(() => {
    checkStatus();
    setMessages([
      {
        role: "bot",
        text: MESSAGES.WELCOME,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      }
    ]);
  }, []);

  async function uploadPDF() {
    if (!file) {
      alert("Select a PDF first");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (!res.ok || data.success === false) {
        setMessages(prev => [...prev, { role: "bot", text: MESSAGES.UPLOAD_FAILED(data.error), timestamp: timeStr }]);
        return;
      }

      setStatus("PDF Indexed ✅");
      setMessages(prev => [...prev, { role: "bot", text: MESSAGES.UPLOAD_SUCCESS(data.fileName), timestamp: timeStr }]);
      setFile(null);
    } catch (err: any) {
      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setMessages(prev => [...prev, { role: "bot", text: MESSAGES.UPLOAD_FAILED(err.message), timestamp: timeStr }]);
    } finally {
      setIsUploading(false);
    }
  }

  async function deleteData() {
    if (!confirm(MESSAGES.DELETE_CONFIRMATION)) return;

    setIsDeleting(true);
    try {
      const res = await fetch("/api/delete", { method: "POST" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      setStatus("No PDF uploaded");
      setMessages([{ role: "bot", text: MESSAGES.DATABASE_CLEARED }]);
    } catch (err: any) {
      alert("Delete failed: " + err.message);
    } finally {
      setIsDeleting(false);
    }
  }

  async function askRAG(q: string, online: boolean) {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, model: selectedModel, isOnline: online }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function askOKFApi(q: string, online: boolean) {
    const res = await fetch("/api/okf-ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, model: selectedModel, isOnline: online }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function ask(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!question.trim() || isAsking) return;

    const userQ = question;
    const userTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setQuestion("");
    setMessages(prev => [...prev, { role: "user", text: userQ, timestamp: userTime }]);
    setIsAsking(true);

    try {
      const botTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      if (searchMode === "rag") {
        const data = await askRAG(userQ, isOnlineMode);
        setMessages(prev => [...prev, { role: "bot", text: data.answer, sources: data.sources, timestamp: botTime }]);
      } else if (searchMode === "okf") {
        const data = await askOKFApi(userQ, isOnlineMode);
        setMessages(prev => [...prev, { role: "bot", text: data.answer, okfSources: data.sources, timestamp: botTime }]);
      } else {
        // Compare: fire both in parallel
        const [ragData, okfData] = await Promise.all([
          askRAG(userQ, isOnlineMode),
          askOKFApi(userQ, isOnlineMode),
        ]);
        setMessages(prev => [...prev, {
          role: "bot",
          text: "",
          isCompare: true,
          ragAnswer: ragData.answer,
          okfAnswer: okfData.answer,
          ragSources: ragData.sources,
          okfSources: okfData.sources,
          timestamp: botTime,
        }]);
      }
    } catch (err: any) {
      const botTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setMessages(prev => [...prev, { role: "bot", text: `Error: ${err.message}`, timestamp: botTime }]);
    } finally {
      setIsAsking(false);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans overflow-hidden">
      {/* Header */}
      <header className="bg-white px-6 py-4 flex items-center justify-between z-10 shrink-0 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <svg className="w-8 h-8 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          <div className="flex flex-col">
            <h1 className="text-lg font-extrabold text-gray-800 leading-none">PocketRAG</h1>
            <span className={`text-[11px] font-extrabold uppercase tracking-widest mt-1.5 transition-colors ${
              searchMode === "rag" ? "text-blue-600" : searchMode === "okf" ? "text-emerald-600" : "text-indigo-600"
            }`}>
              {searchMode === "rag" ? "🔍 RAG Search" : searchMode === "okf" ? "📄 OKF Knowledge" : "⚖️ Compare Engine"}
            </span>
          </div>
        </div>
        {/* Search Mode Toggle */}
        <div className="flex items-center bg-gray-100 rounded-lg p-1 border border-gray-200 gap-0.5">
          {(["rag", "okf", "compare"] as SearchMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSearchMode(m)}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition capitalize ${
                searchMode === m
                  ? "bg-gray-850 bg-gray-800 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {m === "compare" ? "⚖️ Compare" : m === "okf" ? "📄 OKF" : "🔍 RAG"}
            </button>
          ))}
        </div>
      </header>

      {/* Split Workspace */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">

        {/* Chat Section (70% width) */}
        <div className="flex flex-col flex-1 md:w-[70%] bg-gray-50 overflow-hidden relative md:border-r border-gray-200">
          <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            <div className={`mx-auto space-y-6 ${searchMode === "compare" ? "max-w-5xl" : "max-w-3xl"}`}>
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} w-full`}>

                  {/* Compare mode bubble */}
                  {msg.isCompare ? (
                    <div className="w-full grid grid-cols-2 gap-3">
                      {/* RAG Answer */}
                      <div className="bg-white border border-blue-100 rounded-2xl rounded-tl-none p-4 shadow-sm">
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">🔍 RAG</span>
                        </div>
                        <div className="text-sm text-gray-800 whitespace-pre-wrap">{msg.ragAnswer}</div>
                        {msg.ragSources && msg.ragSources.length > 0 && (
                          <div className="mt-3 border-t pt-2 border-gray-100">
                            <button onClick={() => togglePanel(idx * 1000)} className="text-xs text-blue-500 font-semibold flex items-center gap-1">
                              <svg className={`w-3.5 h-3.5 transition-transform ${openPanels[idx * 1000] ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                              {openPanels[idx * 1000] ? "Hide" : `${msg.ragSources.length} chunks`}
                            </button>
                            {openPanels[idx * 1000] && (
                              <div className="mt-2 space-y-1">
                                {msg.ragSources.map((s, si) => (
                                  <div key={si} className="text-[10px] text-gray-500 bg-gray-50 rounded p-1.5 font-mono">p.{s.pageNumber}: {s.pageContent.slice(0, 120)}…</div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="text-[10px] mt-2 text-right text-gray-400">{msg.timestamp}</div>
                      </div>

                      {/* OKF Answer */}
                      <div className="bg-white border border-emerald-100 rounded-2xl rounded-tl-none p-4 shadow-sm">
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">📄 OKF</span>
                        </div>
                        <div className="text-sm text-gray-800 whitespace-pre-wrap">{msg.okfAnswer}</div>
                        {msg.okfSources && msg.okfSources.length > 0 && (
                          <div className="mt-3 border-t pt-2 border-gray-100">
                            <button onClick={() => togglePanel(idx * 1000 + 1)} className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                              <svg className={`w-3.5 h-3.5 transition-transform ${openPanels[idx * 1000 + 1] ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                              {openPanels[idx * 1000 + 1] ? "Hide" : `${msg.okfSources.length} files`}
                            </button>
                            {openPanels[idx * 1000 + 1] && (
                              <div className="mt-2 space-y-1">
                                {msg.okfSources.map((s, si) => (
                                  <div key={si} className="text-[10px] text-gray-500 bg-emerald-50 rounded p-1.5">
                                    <span className="font-semibold text-emerald-700">{s.title}</span> · {s.filename}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="text-[10px] mt-2 text-right text-gray-400">{msg.timestamp}</div>
                      </div>
                    </div>
                  ) : (
                    /* Normal single-mode bubble */
                    <div
                      className={`max-w-[90%] md:max-w-[80%] rounded-2xl p-4 shadow-sm ${
                        msg.role === "user"
                          ? "bg-blue-600 text-white rounded-br-none"
                          : "bg-white text-gray-800 border border-gray-200 rounded-bl-none"
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{msg.text}</div>

                      {/* RAG sources */}
                      {msg.role === "bot" && msg.sources && msg.sources.length > 0 && (
                        <div className="mt-4 border-t pt-3 border-gray-100">
                          <button onClick={() => togglePanel(idx)} className="flex items-center gap-2 text-xs font-semibold text-blue-600 hover:text-blue-700 transition">
                            <svg className={`w-4 h-4 transform transition-transform duration-200 ${openPanels[idx] ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            {openPanels[idx] ? "Hide Sources" : `Show Vector Sources (${msg.sources.length})`}
                          </button>
                          {openPanels[idx] && (
                            <div className="mt-3 overflow-x-auto rounded-lg border border-gray-150">
                              <table className="min-w-full divide-y divide-gray-150 text-sm">
                                <thead className="bg-gray-50"><tr>
                                  <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-24">Page</th>
                                  <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Chunk</th>
                                </tr></thead>
                                <tbody className="bg-white divide-y divide-gray-150">
                                  {msg.sources.map((src, sIdx) => (
                                    <tr key={sIdx} className="hover:bg-gray-50/50">
                                      <td className="px-3 py-2.5 whitespace-nowrap text-xs font-semibold text-gray-600"><span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-100">Page {src.pageNumber}</span></td>
                                      <td className="px-3 py-2.5 text-xs text-gray-600 leading-relaxed font-mono whitespace-pre-wrap">{src.pageContent}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* OKF sources */}
                      {msg.role === "bot" && msg.okfSources && msg.okfSources.length > 0 && (
                        <div className="mt-4 border-t pt-3 border-gray-100">
                          <button onClick={() => togglePanel(idx)} className="flex items-center gap-2 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition">
                            <svg className={`w-4 h-4 transform transition-transform duration-200 ${openPanels[idx] ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            {openPanels[idx] ? "Hide OKF Files" : `Show OKF Files (${msg.okfSources.length})`}
                          </button>
                          {openPanels[idx] && (
                            <div className="mt-2 space-y-1.5">
                              {msg.okfSources.map((s, si) => (
                                <div key={si} className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-xs">
                                  <div className="font-semibold text-emerald-800">{s.title}</div>
                                  <div className="text-gray-500 mt-0.5">{s.description}</div>
                                  <div className="text-[10px] text-emerald-600 mt-1 font-mono">{s.filename} · type: {s.type}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {msg.timestamp && (
                        <div className={`text-[10px] mt-2 text-right ${msg.role === "user" ? "text-blue-200" : "text-gray-400"}`}>
                          {msg.timestamp}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {isAsking && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 text-gray-500 rounded-2xl rounded-bl-none p-4 shadow-sm flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {MESSAGES.THINKING}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </main>

          <footer className="bg-white p-4 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-10 shrink-0">
            <form onSubmit={ask} className="max-w-3xl mx-auto flex gap-3 relative">
              <input
                type="text"
                className="flex-1 border border-gray-300 rounded-full py-3 px-6 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 pr-12 shadow-inner text-sm text-gray-800"
                placeholder={MESSAGES.ASK_PLACEHOLDER}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isAsking}
              />
              <button
                type="submit"
                disabled={isAsking || !question.trim()}
                className="absolute right-2 top-1.5 bottom-1.5 aspect-square bg-blue-600 text-white rounded-full flex items-center justify-center disabled:opacity-50 hover:bg-blue-700 transition-colors"
              >
                <svg className="w-5 h-5 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              </button>
            </form>
          </footer>
        </div>

        {/* Sidebar Configuration Section (30% width) */}
        <aside className="w-full md:w-[30%] flex flex-col bg-white overflow-y-auto p-6 space-y-6 shrink-0 border-t md:border-t-0 md:border-l border-gray-200">

          {/* OKF info banner when in OKF/Compare mode */}
          {searchMode !== "rag" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 leading-relaxed">
              <div className="font-bold mb-1">📄 OKF Bundle Active</div>
              Reading from <span className="font-mono">okf-version/</span> — no vector DB needed.
            </div>
          )}

          {searchMode !== "okf" && (
            <>
              <div>
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
                  Upload your PDF here
                </h2>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-250/60 space-y-4">
                  {/* PDF Status badge */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">Status</span>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-md border ${status.includes("✅")
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-red-50 text-red-750 border-red-100"
                      }`}>
                      {status}
                    </span>
                  </div>

                  {/* Upload controls */}
                  <div className="space-y-2">
                    <label className="flex items-center justify-between cursor-pointer bg-white border border-gray-300 hover:border-blue-500 px-3 py-2 rounded-lg text-xs font-medium text-gray-700 transition">
                      <span className="truncate pr-2">{file ? file.name : "Select PDF"}</span>
                      <span className="text-blue-600 hover:text-blue-700 shrink-0 font-bold">Browse</span>
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                      />
                    </label>

                    <button
                      onClick={uploadPDF}
                      disabled={isUploading || !file}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-xs font-bold transition disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      {isUploading ? (
                        <>
                          <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Indexing...
                        </>
                      ) : (
                        "Upload"
                      )}
                    </button>

                    <div className="text-[10px] text-gray-500 bg-amber-50/50 border border-amber-100 rounded-lg p-2.5 leading-normal mt-2">
                      <span className="font-semibold text-amber-800">⚠️</span> {MESSAGES.PDF_SUPPORT_WARNING}
                    </div>
                  </div>
                </div>
              </div>

              <hr className="border-gray-200" />
            </>
          )}

          {/* LLM SETTINGS Section */}
          <div>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
              LLM SETTINGS
            </h2>
            <div className="space-y-4">
              {/* Mode Toggle Selection */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-gray-500">Inference Mode</span>
                <div className="flex items-center bg-gray-100 rounded-lg p-1 border border-gray-200">
                  <button
                    type="button"
                    onClick={() => setIsOnlineMode(false)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${!isOnlineMode
                      ? "bg-white text-gray-800 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                      }`}
                  >
                    Offline
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOnlineMode(true)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${isOnlineMode
                      ? "bg-white text-gray-800 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                      }`}
                  >
                    Online
                  </button>
                </div>
              </div>

              {/* Model selection (only when offline) */}
              {!isOnlineMode ? (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-gray-500">Model Selection</span>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full bg-white border border-gray-300 px-3 py-2 rounded-lg text-xs font-medium text-gray-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition cursor-pointer"
                    title="Select LLM Model"
                  >
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="bg-yellow-50/50 border border-yellow-100 px-3 py-3 rounded-lg text-[11px] text-gray-600 italic leading-relaxed">
                  {MESSAGES.ONLINE_LIMITS_NOTICE}
                </div>
              )}
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* SYSTEM ACTIONS Section */}
          <div className="mt-auto pt-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              SYSTEM ACTIONS
            </h2>
            <button
              onClick={deleteData}
              disabled={isDeleting}
              className="w-full text-red-500 hover:text-red-600 border border-red-200 hover:bg-red-50 bg-white py-2.5 rounded-lg text-xs font-bold transition disabled:opacity-50"
              title="Delete Database"
            >
              {isDeleting ? "Deleting..." : "Clear Database"}
            </button>
          </div>
        </aside>

      </div>
    </div>
  );
}
