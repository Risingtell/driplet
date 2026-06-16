-- Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.
--
-- SPDX-License-Identifier: Apache-2.0

-- payment_events: append-only log of settled x402 payments
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  endpoint text not null,
  payer text not null,
  amount_usdc text not null,
  network text not null,
  gateway_tx text,
  raw jsonb
);

alter table public.payment_events enable row level security;

create policy "Allow public read access"
  on public.payment_events for select
  using (true);

create policy "Allow service inserts"
  on public.payment_events for insert
  to service_role
  with check (true);

-- withdrawals: audit trail for Gateway withdrawals
create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  amount_usdc text not null,
  destination_chain text not null,
  destination_address text not null,
  status text not null default 'submitted' check (status in ('submitted', 'confirmed', 'failed')),
  tx_hash text
);

alter table public.withdrawals enable row level security;

create policy "Allow public read access"
  on public.withdrawals for select
  using (true);

create policy "Allow service inserts"
  on public.withdrawals for insert
  to service_role
  with check (true);

create policy "Allow service updates"
  on public.withdrawals for update
  to service_role
  using (true);
