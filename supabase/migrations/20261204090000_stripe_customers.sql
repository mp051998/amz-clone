/*
 * Saved cards, as Amazon's "Your Payments" wallet. Cards are typed and kept on Stripe, never
 * here: each shopper gets a Stripe Customer the first time they pay by card (or add a card), and
 * hosted Checkout offers to save the card to it and shows the saved ones next time. All this
 * table holds is which Stripe Customer is whose. Only the server (service role) reads or writes
 * it: a shopper never needs the id, and must never be able to point their account at another
 * customer's cards. Closing the account drops the row (the server deletes the Stripe Customer,
 * and with it the saved cards).
 */

create table public.stripe_customers (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  customer_id text not null unique check (customer_id ~ '^cus_[A-Za-z0-9]+$'),
  created_at  timestamptz not null default now()
);

alter table public.stripe_customers enable row level security;
-- no policies: service role only
revoke all on table public.stripe_customers from anon, authenticated;
