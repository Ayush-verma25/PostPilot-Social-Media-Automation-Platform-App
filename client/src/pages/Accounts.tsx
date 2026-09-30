import { PlusIcon } from "lucide-react";
import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import AccountList from "../components/AccountList";
import { PLATFORMS } from "../assets/assets";
import PlatformPickerModal from "../components/PlatformPickerModal";
import toast from "react-hot-toast";
import api from "../api/axios";

interface SocialAccount {
  _id: string;
  handle: string;
  platform: string;
  status: string;
}

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data.message || error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
};

const Accounts = () => {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [showPlatformPicker, setShowPlatformPicker] = useState(false);

  const fetchAccounts = useCallback(
    async (isSync = false, platform?: string | null, successMsg?: string) => {
      try {
        if (isSync) {
          const label = platform
            ? platform.charAt(0).toUpperCase() + platform.slice(1)
            : "Social Media";
          toast.loading(`Syncing ${label} accounts...`, { id: "sync" });
          await api.get("/api/oauth/sync");
          toast.success(successMsg || "Accounts synced!", { id: "sync" });
        }

        const { data } = await api.get("/api/accounts");
        setAccounts(data);
      } catch (error: unknown) {
        const message = axios.isAxiosError<{ message?: string }>(error)
          ? error.response?.data.message || error.message
          : error instanceof Error
            ? error.message
            : "Failed to fetch accounts";
        toast.error(message, isSync ? { id: "sync" } : undefined);
      }
    },
    [],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const connectedPlatform = params.get("connected");
      const connectedUsername = params.get("username");
      const syncNeeded = params.get("sync") === "true";
      const errorMsg = params.get("error");

      window.history.replaceState({}, document.title, window.location.pathname);

      if (connectedPlatform) {
        const label =
          connectedPlatform.charAt(0).toUpperCase() +
          connectedPlatform.slice(1);
        const handle = connectedUsername ? `(@${connectedUsername})` : "";
        void fetchAccounts(
          true,
          connectedPlatform,
          `${label}${handle} connected`,
        );
      } else if (errorMsg) {
        toast.error(`Connection failed: ${errorMsg}`);
        void fetchAccounts();
      } else if (syncNeeded) {
        void fetchAccounts(true, null, "Accounts synced!");
      } else {
        void fetchAccounts();
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchAccounts]);

  const handleDisconnect = async (accountId: string): Promise<void> => {
    try {
      await api.delete(`/api/accounts/${accountId}`);
      toast.success("Account disconnected");
      await fetchAccounts();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to disconnect account"));
    }
  };

  const connectedIds = accounts.map((a) => a.platform);

  const handleConnect = async (platformId: string): Promise<void> => {
    setConnecting(platformId);
    try {
      const { data } = await api.get<{ url?: string }>(
        `/api/oauth/${platformId}/url`,
      );
      if (!data.url) {
        throw new Error("The authorization URL was not provided");
      }
      window.location.href = data.url;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, `Failed to connect ${platformId}`));
      setConnecting(null);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm">
        <div>
          <h2 className="text-xl text-slate-900">Connected Accounts</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            {accounts.length} of {PLATFORMS.length} platforms connected
          </p>
        </div>
        <button
          onClick={() => setShowPlatformPicker(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-violet-500 hover:bg-violet-600 text-white rounded-full font-medium transition-all w-full sm:w-auto justify-center"
        >
          <PlusIcon className="size-4" /> Connect Account
        </button>
      </div>

      {/* Platform picker Modal */}
      {showPlatformPicker && (
        <PlatformPickerModal
          connectedIds={connectedIds}
          connecting={connecting}
          onClose={() => setShowPlatformPicker(false)}
          onConnect={handleConnect}
        />
      )}

      {/* Connected Accounts List */}
      <AccountList accounts={accounts} onDisconnect={handleDisconnect} />
    </div>
  );
};

export default Accounts;
