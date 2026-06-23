import { WalletPanel } from "@/components/creator/wallet-panel";
import { getWalletInfo } from "@/app/creator/actions";

export default async function WalletPage() {
  const info = await getWalletInfo();
  return <WalletPanel address={info.address ?? ""} balance={info.balance ?? 0} />;
}
