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

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type Withdrawal = {
  id: string;
  created_at: string;
  amount_usdc: string;
  destination_chain: string;
  destination_address: string;
  status: "submitted" | "confirmed" | "failed";
  tx_hash: string | null;
};

export function useWithdrawals() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function fetchInitial() {
      const { data, error } = await supabase
        .from("withdrawals")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch withdrawals:", error.message);
      } else {
        setWithdrawals((prev) => {
          if (prev.length === 0) return data as Withdrawal[];
          const fetched = data as Withdrawal[];
          const existingIds = new Set(fetched.map((e) => e.id));
          const realtimeOnly = prev.filter((e) => !existingIds.has(e.id));
          return [...realtimeOnly, ...fetched];
        });
      }
      setLoading(false);
    }

    const channel = supabase
      .channel("withdrawals-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "withdrawals" },
        (payload) => {
          setWithdrawals((prev) => {
            const newItem = payload.new as Withdrawal;
            if (prev.some((w) => w.id === newItem.id)) return prev;
            return [newItem, ...prev];
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "withdrawals" },
        (payload) => {
          setWithdrawals((prev) =>
            prev.map((w) =>
              w.id === (payload.new as Withdrawal).id
                ? (payload.new as Withdrawal)
                : w,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "withdrawals" },
        (payload) => {
          setWithdrawals((prev) =>
            prev.filter(
              (w) => w.id !== (payload.old as { id: string }).id,
            ),
          );
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          fetchInitial();
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { withdrawals, loading };
}
