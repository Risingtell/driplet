import { WalletPanel } from "@/components/creator/wallet-panel";
import { getWalletInfo } from "@/app/creator/actions";

// The withdraw action runs here. A creator's first withdrawal also funds gas,
// adds the treasury as their Gateway delegate and waits for Gateway to see it,
// so it can take most of a minute end to end.
export const maxDuration = 120;

export default async function WalletPage() {
  const info = await getWalletInfo();
  return (
    <WalletPanel
      address={info.address ?? ""}
      balance={info.balance ?? 0}
      earnings={info.earnings ?? 0}
      withdrawable={info.withdrawable ?? 0}
    />
  );
}
