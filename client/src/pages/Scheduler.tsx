import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { PLATFORMS } from "../assets/assets";
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  CalendarIcon,
  ClockIcon,
  SendIcon,
  XIcon,
} from "lucide-react";
import api from "../api/axios";
import toast from "react-hot-toast";

interface SchedulerPost {
  _id: string;
  content: string;
  platforms: string[];
  scheduledFor: string;
  status: string;
  mediaUrl?: string | null;
  mediaType?: string;
  publishError?: string;
  createdAt: string;
  updatedAt: string;
}

interface ApiSchedulerPost extends Omit<SchedulerPost, "platforms"> {
  platform?: string[];
  platforms?: string[];
}

const normalizePost = (post: ApiSchedulerPost): SchedulerPost => ({
  ...post,
  platforms: post.platforms ?? post.platform ?? [],
});

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError<{ message?: string } | string>(error)) {
    const responseData = error.response?.data;
    if (typeof responseData === "string") return responseData;
    return responseData?.message || error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong";
};

const Scheduler = () => {
  const [posts, setPosts] = useState<SchedulerPost[]>([]);
  const [content, setContent] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submissionError, setSubmissionError] = useState("");

  const fetchPosts = useCallback(async () => {
    try {
      const { data } = await api.get<ApiSchedulerPost[]>("/api/posts");
      setPosts(data.map(normalizePost));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    (async () => await fetchPosts())();
    const interval = window.setInterval(() => void fetchPosts(), 10000);
    return () => {
      window.clearInterval(interval);
    };
  }, [fetchPosts]);

  useEffect(() => {
    return () => {
      if (mediaPreviewUrl) {
        URL.revokeObjectURL(mediaPreviewUrl);
      }
    };
  }, [mediaPreviewUrl]);

  const scheduled = posts.filter((p) => p.status === "scheduled");
  const published = posts.filter((p) => p.status === "published");
  const needsAttention = posts.filter(
    (p) => p.status === "failed" || p.status === "partial",
  );

  const togglePlatform = (id: string) =>
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPlatforms.length === 0) {
      toast.error("Select at least one platform.");
      return;
    }
    if (!scheduledDate || !scheduledTime) {
      toast.error("Choose a date and time.");
      return;
    }

    if (
      (selectedPlatforms.includes("instagram") ||
        selectedPlatforms.includes("instagram_business")) &&
      !mediaFile
    ) {
      toast.error("Instagram requires an image or video.");
      return;
    }

    const scheduledFor = new Date(
      `${scheduledDate}T${scheduledTime}`,
    ).toISOString();
    const formData = new FormData();
    formData.append("content", content);
    formData.append("scheduledFor", scheduledFor);
    formData.append("status", "scheduled");
    formData.append("platforms", JSON.stringify(selectedPlatforms));
    if (mediaFile) formData.append("media", mediaFile);

    setLoading(true);
    setSubmissionError("");
    try {
      await api.post("/api/posts", formData);
      toast.success("Post scheduled successfully.");
      setContent("");
      setScheduledDate("");
      setScheduledTime("");
      setSelectedPlatforms([]);
      setMediaFile(null);
      fetchPosts();
    } catch (error: unknown) {
      setSubmissionError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleMediaChange = (file: File | undefined) => {
    if (file && file.size > 50 * 1024 * 1024) {
      toast.error("Media files must be 50 MB or smaller.");
      return;
    }
    setMediaPreviewUrl(file ? URL.createObjectURL(file) : null);
    setMediaFile(file ?? null);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full">
      {/* -Compose panel- */}
      <div className="w-full lg:w-115 shrink-0">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <h2 className="text-lg text-slate-700">Compose Post</h2>
          </div>

          <form className="space-y-5" onSubmit={handleSchedule}>
            {/* Platforms */}
            <div>
              <label className="block text-xs text-slate-500 uppercase mb-2">
                Platforms
              </label>
              <div className="flex flex-wrap gap-3">
                {PLATFORMS.map((p) => {
                  const active = selectedPlatforms.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePlatform(p.id)}
                      aria-label={p.name}
                      aria-pressed={active}
                      className={`flex items-center gap-1.5 p-3 rounded-md border transition-all duration-150 ${active ? "bg-violet-50 border-violet-300 text-violet-500 scale-103" : "border-slate-200 text-slate-500  hover:border-slate-300"}`}
                    >
                      <p.icon className="size-4.5" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Content */}
            <div>
              <label className="block text-xs text-slate-500 uppercase mb-2">
                Content
              </label>
              <textarea
                required
                maxLength={280}
                rows={5}
                placeholder="What do you want to share today?"
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 text-sm placeholder-slate-400 outline-none resize-none"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <div
                className={`text-right text-xs mt-1 font-medium ${content.length > 270 ? "text-violet-500" : "text-slate-400"}`}
              >
                {content.length}/280
              </div>
            </div>

            {/* Media upload */}
            <div>
              <label className="block text-xs text-slate-500 uppercase mb-2">
                Media (optional)
              </label>
              {mediaFile ? (
                <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                  {mediaFile.type.startsWith("image/") ? (
                    <img
                      src={mediaPreviewUrl ?? undefined}
                      alt="preview"
                      className="w-full h-40 object-cover"
                    />
                  ) : (
                    <video
                      src={mediaPreviewUrl ?? undefined}
                      className="w-full h-40 object-cover"
                      controls
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => handleMediaChange(undefined)}
                    className="absolute top-2 right-2 size-7 bg-slate-900/60 hover:bg-slate-900/80 text-white rounded-full flex items-center justify-center transition-colors"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 p-5 py-10 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-violet-300 hover:bg-violet-50/30 transition-all group">
                  <span className="text-sm text-slate-500 group-hover:text-violet-600 transition-colors">
                    Click to upload Image or Video
                  </span>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => handleMediaChange(e.target.files?.[0])}
                  />
                </label>
              )}
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 uppercase mb-2">
                  Date
                </label>
                <div className="relative">
                  <CalendarIcon className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="date"
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm outline-none"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 uppercase mb-2">
                  Time
                </label>
                <div className="relative">
                  <ClockIcon className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />

                  <input
                    type="time"
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm outline-none"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Submit */}
            {submissionError && (
              <p role="alert" className="text-sm text-red-500">
                {submissionError}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-violet-500 hover:bg-violet-600 transition-all text-white rounded-lg"
            >
              {loading ? (
                <>
                  <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  Schedule Post
                  <ArrowRightIcon className="size-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Queue Panels */}

      <div className="flex-1 flex flex-col gap-6 min-w-0">
        {/* Upcomming */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col min-h-0">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
            <CalendarDaysIcon className="size-4 text-zinc-500" />
            <h3 className="text-slate-900 text-sm">Upcoming</h3>
            <span className="ml-auto text-xs font-bold bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-full">
              {scheduled.length}
            </span>
          </div>
          <div className="max-h-[240px] overflow-y-auto divide-y divide-slate-50">
            {scheduled.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">
                No Scheduled Posts Yet
              </div>
            ) : (
              scheduled.map((post) => (
                <div
                  key={post._id}
                  className="px-5 py-4 hover:bg-slate-50/60 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex gap-1.5 items-center">
                      {post.platforms.map((pl: string) => {
                        const meta = PLATFORMS.find((p) => p.id === pl);
                        return meta ? (
                          <meta.icon
                            key={pl}
                            className="size-3.5 text-slate-400"
                          />
                        ) : null;
                      })}
                    </div>

                    <div className="flex items-center gap-2">
                      {post.mediaType && (
                        <span className="text-xs bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded-md font-semibold capitalize">
                          {post.mediaType}
                        </span>
                      )}

                      <span className="text-xs text-slate-400">
                        {new Date(post.scheduledFor).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-slate-500 line-clamp-2 max-w-md">
                    {post.content}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Published */}

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col min-h-0">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
            <SendIcon className="size-4 text-zinc-500" />
            <h3 className="text-slate-900 text-sm">Published</h3>
            <span className="ml-auto text-xs font-bold bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-full">
              {published.length}
            </span>
          </div>
          <div className="max-h-[240px] overflow-y-auto divide-y divide-slate-50">
            {published.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">
                No Published Posts Yet
              </div>
            ) : (
              published.map((post) => (
                <div
                  key={post._id}
                  className="px-5 py-4 hover:bg-slate-50/60 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex gap-1.5 items-center">
                      {post.platforms.map((pl: string) => {
                        const meta = PLATFORMS.find((p) => p.id === pl);
                        return meta ? (
                          <meta.icon
                            key={pl}
                            className="size-3.5 text-slate-400"
                          />
                        ) : null;
                      })}
                    </div>

                    <div className="flex items-center gap-2">
                      {post.mediaType && (
                        <span className="text-xs bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded-md font-semibold capitalize">
                          {post.mediaType}
                        </span>
                      )}

                      <span className="text-xs text-slate-400">
                        {new Date(post.updatedAt).toLocaleString()}
                      </span>
                      <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full">
                        Published
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-slate-500 line-clamp-2 max-w-4/5">
                    {post.content}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Failed and partially published posts */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col min-h-0">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
            <XIcon className="size-4 text-red-500" />
            <h3 className="text-slate-900 text-sm">Needs attention</h3>
            <span className="ml-auto text-xs font-bold bg-red-50 text-red-700 px-2 py-0.5 rounded-full">
              {needsAttention.length}
            </span>
          </div>
          <div className="max-h-[240px] overflow-y-auto divide-y divide-slate-50">
            {needsAttention.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">
                No failed or partially published posts
              </div>
            ) : (
              needsAttention.map((post) => (
                <div key={post._id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex gap-1.5 items-center">
                      {post.platforms.map((platform) => {
                        const meta = PLATFORMS.find(
                          (item) => item.id === platform,
                        );
                        return meta ? (
                          <meta.icon
                            key={platform}
                            className="size-3.5 text-slate-400"
                          />
                        ) : null;
                      })}
                    </div>
                    <span className="text-xs font-semibold text-red-600 capitalize">
                      {post.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 line-clamp-2">
                    {post.content}
                  </p>
                  {post.publishError && (
                    <p className="text-xs text-red-500 mt-2" role="alert">
                      {post.publishError}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Scheduler;
