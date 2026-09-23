import { PlusIcon } from "lucide-react";
import { useState } from "react";
import AccountList from "../components/AccountList";
import { dummyAccountsData, PLATFORMS } from "../assets/assets";
import PlatformPickerModal from "../components/PlatformPickerModal";

const Accounts = () => {
  const [accounts, setAccounts] =
    useState<typeof dummyAccountsData>(dummyAccountsData);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [showPlatformPicker, setShowPlatformPicker] = useState(false);

  const fetchAccounts = async (
    isSync = false,
    platform?: string | null,
    successMsg?: string,
  ) => {
    setAccounts(dummyAccountsData);
    console.log(isSync, platform, successMsg);
  };

  const handleDisconnect = async (accountId: string): Promise<void> => {
    setAccounts(accounts.filter((account) => account._id !== accountId));
  };

  const connectedIds = accounts.map((a) => a.platform);

  const handleConnect = async (platformId: string): Promise<void> => {
    const platform = PLATFORMS.find(({ id }) => id === platformId);
    if (!platform) return;

    setConnecting(platform.id);
    await fetchAccounts(true, platform.id, `${platform.name} connected`);
    setConnecting(null);
    setShowPlatformPicker(false);
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
