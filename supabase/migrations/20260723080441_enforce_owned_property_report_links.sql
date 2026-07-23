-- Prevent authenticated users from linking their rows to another user's
-- property report. The foreign keys alone only prove that a report exists;
-- these policies also require the linked report to be visible to its owner.

drop policy if exists "Users can insert their own comparisons"
  on public.property_comparisons;
create policy "Users can insert their own comparisons"
  on public.property_comparisons
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      report_a_id is null
      or exists (
        select 1
        from public.property_reports as report_a
        where report_a.id = property_comparisons.report_a_id
          and report_a.user_id = (select auth.uid())
      )
    )
    and (
      report_b_id is null
      or exists (
        select 1
        from public.property_reports as report_b
        where report_b.id = property_comparisons.report_b_id
          and report_b.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Users can update their own comparisons"
  on public.property_comparisons;
create policy "Users can update their own comparisons"
  on public.property_comparisons
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      report_a_id is null
      or exists (
        select 1
        from public.property_reports as report_a
        where report_a.id = property_comparisons.report_a_id
          and report_a.user_id = (select auth.uid())
      )
    )
    and (
      report_b_id is null
      or exists (
        select 1
        from public.property_reports as report_b
        where report_b.id = property_comparisons.report_b_id
          and report_b.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Users can insert their own watchlist items"
  on public.watchlist_items;
create policy "Users can insert their own watchlist items"
  on public.watchlist_items
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      property_report_id is null
      or exists (
        select 1
        from public.property_reports as linked_report
        where linked_report.id = watchlist_items.property_report_id
          and linked_report.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Users can update their own watchlist items"
  on public.watchlist_items;
create policy "Users can update their own watchlist items"
  on public.watchlist_items
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      property_report_id is null
      or exists (
        select 1
        from public.property_reports as linked_report
        where linked_report.id = watchlist_items.property_report_id
          and linked_report.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Users can insert into their own portfolio"
  on public.portfolio_properties;
create policy "Users can insert into their own portfolio"
  on public.portfolio_properties
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      property_report_id is null
      or exists (
        select 1
        from public.property_reports as linked_report
        where linked_report.id = portfolio_properties.property_report_id
          and linked_report.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Users can update their own portfolio"
  on public.portfolio_properties;
create policy "Users can update their own portfolio"
  on public.portfolio_properties
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      property_report_id is null
      or exists (
        select 1
        from public.property_reports as linked_report
        where linked_report.id = portfolio_properties.property_report_id
          and linked_report.user_id = (select auth.uid())
      )
    )
  );
