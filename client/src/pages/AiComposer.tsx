import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { PLATFORMS } from "../assets/assets";
import {
  ArrowRightIcon,
  CalendarIcon,
  ClockIcon,
  HistoryIcon,
  Loader2Icon,
  TimerIcon,
  Wand2Icon,
  XIcon,
} from "lucide-react";
import api from "../api/axios";
import toast from "react-hot-toast";

interface Generation {
  _id: string;
  prompt: string;
  content: string;
  mediaUrl?: string;
  mediaType?: string;
  tone: string;
  createdAt: string;
  updatedAt: string;
  platforms?: string[];
  scheduledFor?: string;
  status?: string;
}

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError<{ message?: string } | string>(error)) {
    const responseData = error.response?.data;
    if (typeof responseData === "string") return responseData;
    return responseData?.message || error.message;
  }
  return error instanceof Error ? error.message : fallback;
};

const AiComposer = () => {
  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState("Professional");
  const [generateImage, setGenerateImage] = useState(true);
  const [loading, setLoading] = useState(false);
  const [generations, setGenerations] = useState<Generation[]>([]);

  //Scheduling State
  const [activeScheduler, setActiveScheduler] = useState<Generation | null>(
    null,
  );
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [scheduling, setScheduling] = useState(false);

  const scheduledDateTime = useMemo<Date | null>(() => {
    if (!scheduledDate || !scheduledTime) {
      return null;
    }

    const [year, month, day] = scheduledDate.split("-").map(Number);
    const [hours, minutes] = scheduledTime.split(":").map(Number);

    if (
      [year, month, day, hours, minutes].some((value) => Number.isNaN(value))
    ) {
      return null;
    }

    const dateTime = new Date(year, month - 1, day, hours, minutes);

    return Number.isNaN(dateTime.getTime()) ? null : dateTime;
  }, [scheduledDate, scheduledTime]);

  const canSchedule =
    selectedPlatforms.length > 0 &&
    scheduledDateTime !== null;

  useEffect(() => {
    let isMounted = true;
    const loadGenerations = async () => {
      try {
        const { data } = await api.get<Generation[]>("/api/posts/generations");
        if (isMounted) setGenerations(data);
      } catch (error: unknown) {
        if (isMounted) {
          toast.error(getErrorMessage(error, "Failed to load generations."));
        }
      }
    };
    void loadGenerations();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt.");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post<Generation>("/api/posts/generate", {
        prompt,
        tone,
        generateImage,
      });
      setGenerations((previous) => [data, ...previous]);
      setActiveScheduler(data);
      toast.success("Content generated successfully.");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to generate post."));
    } finally {
      setLoading(false);
    }
  };

  const closeScheduler = () => {
    setActiveScheduler(null);
    setSelectedPlatforms([]);
    setScheduledDate("");
    setScheduledTime("");
  };

  const handleSchedule = async () => {
    if (!activeScheduler) return;
    if (selectedPlatforms.length === 0) {
      toast.error("Please select at least one platform.");
      return;
    }

    if (!scheduledDate || !scheduledTime) {
      toast.error("Please choose a date and time.");
      return;
    }
    if (!scheduledDateTime || scheduledDateTime.getTime() <= Date.now()) {
      toast.error("Please choose a future date and time.");
      return;
    }
    if (
      (selectedPlatforms.includes("instagram") ||
        selectedPlatforms.includes("instagram_business")) &&
      !activeScheduler.mediaUrl
    ) {
      toast.error("Instagram posts require an image or video.");
      return;
    }

    const scheduledFor = new Date(
      `${scheduledDate}T${scheduledTime}`,
    ).toISOString();
    setScheduling(true);
    try {
      await api.post("/api/posts", {
        content: activeScheduler.content,
        mediaUrl: activeScheduler.mediaUrl,
        mediaType: activeScheduler.mediaType,
        platforms: selectedPlatforms,
        scheduledFor,
        status: "scheduled",
      });
      toast.success("AI Post scheduled successfully.");
      setActiveScheduler(null);
      setSelectedPlatforms([]);
      setScheduledTime("");
      setScheduledDate("");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to schedule post."));
    } finally {
      setScheduling(false);
    }
  };

  const tones = ["Professional", "Creative", "Funny", "Minimalist", "Exicted"];

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-20 animate-in fade-in duration-700">
      {/* Input Section */}
      <div className="space-y-6 text-center mt-20">
        <h1 className="text-3xl text-slate-700 tracking-tight">
          What Should We Create Today?
        </h1>
        <div className="relative group mt-12">
          <textarea
            className="w-full px-6 py-6 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 outline-none focus:border-slate-400 transition resize-none h-40"
            placeholder="Share your Idea... (e.g. A post about the launch of our new eco-friendly coffee beans)"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="absolute bottom-4 right-2.5 flex items-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => setGenerateImage(!generateImage)}
              aria-pressed={generateImage}
              className="flex items-center gap-3 bg-violet-50 py-2 px-3 rounded-lg"
            >
              <span>AI Images</span>
              <div
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${generateImage ? "bg-violet-500" : "bg-slate-200"}`}
              >
                <span
                  className={`pointer-events-none size-4 transform translate-y-0.5 rounded-full bg-white shadow-sm transition ${generateImage ? "translate-x-4.5" : "translate-x-0.5"}`}
                />
              </div>
            </button>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-2 px-4 py-2 rounded-lg"
            >
              {loading ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  Generate
                  <ArrowRightIcon className="size-4" />
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {tones.map((t) => (
            <button
              key={t}
              onClick={() => setTone(t)}
              className={`px-4 py-1.5 rounded-full text-sm transition-all border ${tone === t ? "bg-violet-500 border-violet-500 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* AI Generated Posts */}
      <div className="space-y-6 pt-12 border-t border-slate-100">
        <div className="flex items-center justify-between text-slate-600">
          <div className="flex items-center gap-2">
            <HistoryIcon className="size-5" />
            <h2 className="text-xl">Recent Generations</h2>
          </div>
          <span className="text-sm text-slate-500 bg-slate-50 px-2">
            {generations.length} total
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {generations.map((gen) => (
            <div
              key={gen._id}
              className="group bg-white rounded-2xl border border-slate-100 p-5 hover:border-violet-200 transition-all relative overflow-hidden"
            >
              <div className="flex flex-col h-full space-y-4">
                <div className="flex items-center justify-between ">
                  <span className="text-xs text-slate-400 uppercase tracking-widest">
                    {new Date(gen.createdAt).toLocaleString()}
                  </span>
                  <span className="text-xs text-violet-500 bg-violet-50 px-2 py-0.5 rounded-md">
                    {gen.tone}
                  </span>
                </div>
                <p className="text-sm text-slate-600 line-clamp-3 leading-relaxed flex-1">
                  {gen.content}
                </p>

                {gen.mediaUrl && (
                  <div className="rounded-xl overflow-hidden border border-slate-50 bg-slate-50">
                    <img
                      src={gen.mediaUrl}
                      alt="Gen"
                      className="w-full aspect-video object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => setActiveScheduler(gen)}
                    className="flex-1 bg-slate-100 hover:bg-violet-500 hover:text-white text-slate-600 text-xs py-2.5 rounded-lg transition-all"
                  >
                    Schedule Post
                  </button>
                </div>
              </div>
            </div>
          ))}

          {generations.length === 0 && (
            <div className="col-span-full py-20 text-center space-y-2">
              <div className="size-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto text-slate-300">
                <Wand2Icon className="size-6" />
              </div>
              <p className="text-slate-400 text-sm">
                No content generated yet. Try generating some content using the
                AI.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Schedular Modal */}

      {activeScheduler && (
        <div className="fixed inset-0 min-h-screen z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-8 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-slate-900">Schedule Generation</h3>
              <button
                type="button"
                aria-label="Close scheduler"
                onClick={closeScheduler}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 transition-colors"
              >
                <XIcon className="size-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-4">
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 space-y-4">
                <p className="text-slate-800 text-sm leading-relaxed whitespace-pre-wrap">
                  {activeScheduler.prompt}
                </p>
              </div>

              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 space-y-4">
                <p className="text-slate-800 text-sm leading-relaxed whitespace-pre-wrap">
                  {activeScheduler.content}
                </p>
                {activeScheduler.mediaUrl && (
                  <img
                    src={activeScheduler.mediaUrl}
                    alt="preview"
                    className="w-full aspect-video object-cover rounded-xl border border-slate-200 shadow-sm"
                  />
                )}
              </div>
            </div>

            <div className="p-8 bg-slate-50/50 border-t border-slate-50 space-y-8">
              {/* Options */}
              <div className="space-y-6">
                <div>
                  <label className="block text-xs text-slate-600 uppercase tracking-widest">
                    Select Channels
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORMS.map((p) => {
                      const active = selectedPlatforms.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          aria-label={`${p.name} ${active ? "selected" : "not selected"}`}
                          aria-pressed={active}
                          onClick={() =>
                            setSelectedPlatforms((prev) =>
                              prev.includes(p.id)
                                ? prev.filter((x) => x !== p.id)
                                : [...prev, p.id],
                            )
                          }
                          className={`p-2.5 rounded-md border text-xs ${active ? "bg-violet-500/80 text-white" : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"}`}
                        >
                          <p.icon className="size-4.5" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="relative ">
                    <CalendarIcon className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      id="scheduled-date"
                      type="date"
                      aria-label="Schedule date"
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-md text-slate-900 text-sm focus:outline-none transition-all"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                    />
                  </div>
                  <div className="relative ">
                    <ClockIcon className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      id="scheduled-time"
                      type="time"
                      aria-label="Schedule time"
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-md text-slate-900 text-sm focus:outline-none transition-all"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSchedule}
                disabled={scheduling || !canSchedule}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-md bg-slate-200 text-slate-700 hover:bg-violet-500 hover:text-white transition"
              >
                {scheduling ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <TimerIcon className="size-4" />
                )}
                Schedule Post
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AiComposer;
