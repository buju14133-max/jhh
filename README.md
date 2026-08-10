# Digital Sales Book — Inventory/Sales Synchronization Update

This update keeps the existing interface and changes only the requested behavior:

1. **Record Sale is hidden and inaccessible for Admin accounts.**
2. **Admin-added inventory is stored in Supabase and is therefore visible to Sales Rep accounts.**
3. **Sales are stored in Supabase and are visible in the Admin Total Sales report.**
4. **Recording a sale atomically decreases the selected inventory variant quantity.**
5. **Sales reps must select a Payment method when recording a sale.**
6. **Admin Total Sales includes the current remaining stock table.**

## Supabase configuration

In `script.js`, replace:

- `YOUR_SUPABASE_URL` with your Supabase project URL.
- `YOUR_SUPABASE_ANON_KEY` with your Supabase publishable/anon key.

Do **not** put an `sb_secret_...` key in the browser.

## Required SQL

Run `supabase_sales_inventory.sql` once in the Supabase SQL Editor.

It adds the `record_sale_v2` transaction function and the narrowly scoped RLS permissions needed for:

- authenticated users to read products/inventory/categories/payment methods;
- admins to add products and inventory;
- admins to view all sales;
- sales reps to view their own sales;
- sale recording to atomically insert the sale, insert the sale item, and reduce stock.

The existing username login RPC remains required:

```sql
create or replace function public.get_login_email(profile_username text)
returns text
language sql
security definer
set search_path = public, auth
as $$
  select au.email
  from public.profiles p
  join auth.users au on au.id = p.id
  where p.username = profile_username
    and coalesce(p.active, true) = true
  limit 1;
$$;

revoke all on function public.get_login_email(text) from public;
grant execute on function public.get_login_email(text) to anon, authenticated;
```

If the profile read policy is not already present:

```sql
create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);
```

## Important

The frontend no longer uses localStorage for inventory or sales. Supabase is the source of truth, so an inventory change or sale is shared across Admin and Sales Rep accounts.

No other interface styling/assets were changed.
