/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, RefreshCw } from "lucide-react";

export interface GatewayBalances {
  wallet: { balance: string };
  gateway: {
    total: string;
    available: string;
    withdrawing: string;
    withdrawable: string;
  };
}

interface GatewayBalanceDialogProps {
  balances: GatewayBalances | null;
  loading: boolean;
  onRefresh: () => void;
  trigger: React.ReactNode;
}

export function GatewayBalanceDialog({
  balances,
  loading,
  onRefresh,
  trigger,
}: GatewayBalanceDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex-row items-start justify-between gap-4 text-left">
          <div className="space-y-1">
            <DialogTitle>Gateway Balance</DialogTitle>
            <DialogDescription>
              Current gateway and wallet balances.
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={loading}
            className="h-8 w-8 shrink-0 self-end"
            aria-label="Refresh balances"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Button>
        </DialogHeader>

        {loading && !balances ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 size={14} className="animate-spin" />
            Loading...
          </div>
        ) : balances ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div className="text-muted-foreground">Available</div>
            <div className="font-mono text-right">${balances.gateway.available}</div>
            <div className="text-muted-foreground">Total</div>
            <div className="font-mono text-right">${balances.gateway.total}</div>
            <div className="text-muted-foreground">Withdrawing</div>
            <div className="font-mono text-right">${balances.gateway.withdrawing}</div>
            <div className="text-muted-foreground">Withdrawable</div>
            <div className="font-mono text-right">
              ${balances.gateway.withdrawable}
            </div>
            <div className="text-muted-foreground pt-1 border-t mt-1">Wallet USDC</div>
            <div className="font-mono text-right pt-1 border-t mt-1">
              ${balances.wallet.balance}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Could not load balances.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
