/**
 * Compile + deploy StreamRegistry to Arc testnet. Run once:
 *   node scripts/deploy-registry.mjs
 * Prints the deployed address and writes the ABI to lib/stream-registry-abi.json.
 */
import fs from "fs";
import solc from "solc";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);

const source = fs.readFileSync("contracts/StreamRegistry.sol", "utf8");
const input = {
  language: "Solidity",
  sources: { "StreamRegistry.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
if (out.errors) {
  const fatal = out.errors.filter((e) => e.severity === "error");
  if (fatal.length) { console.error(fatal.map((e) => e.formattedMessage).join("\n")); process.exit(1); }
}
const c = out.contracts["StreamRegistry.sol"].StreamRegistry;
const abi = c.abi;
const bytecode = ("0x" + c.evm.bytecode.object);

const arc = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
};
const account = privateKeyToAccount(env.SELLER_PRIVATE_KEY);
const wallet = createWalletClient({ account, chain: arc, transport: http() });
const pub = createPublicClient({ chain: arc, transport: http() });

console.log("deploying StreamRegistry from", account.address, "…");
const hash = await wallet.deployContract({ abi, bytecode, args: [] });
console.log("deploy tx:", hash);
const rec = await pub.waitForTransactionReceipt({ hash });
console.log("STATUS:", rec.status, "ADDRESS:", rec.contractAddress);

fs.writeFileSync("lib/stream-registry-abi.json", JSON.stringify(abi, null, 2));
console.log("ABI written to lib/stream-registry-abi.json");
console.log("\nAdd to .env.local + Vercel:  STREAM_REGISTRY_ADDRESS=" + rec.contractAddress);
