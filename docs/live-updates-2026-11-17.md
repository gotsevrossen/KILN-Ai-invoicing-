# Shared live updates and menu haptics

The floating menu gives a light selection haptic when a tab change is accepted, including each page crossed while dragging the orange slider. Selecting the current tab does not repeat it. Uses SDK-compatible `expo-haptics`; an installed standalone app needs a rebuilt APK to include the native module. Physical feedback follows the device's haptic settings.

The app now subscribes to private Supabase Broadcast channels for its signed-in user and active business. Database changes send only a `changed` invalidation (plus the transport's generated message ID), never a receipt, job, price or other record. Screens then reload through existing RLS-protected reads and restricted crew RPCs.

- Receipts, job assignments, work, notes, photos, hours, documents, payments, packages and other existing business tables produce notices. Bulk writes send at most one notice per topic per transaction.
- Crew home/job lists and open job details refresh automatically. Team people/activity, packages, operations and the owner/manager store refresh too.
- Membership changes also notify the affected person's private user channel. Approval, removal and role changes re-check membership; changed access clears the old account view. A removed job disappears from crew reads, and an unavailable open crew job clears its previously loaded details.
- Bursts are coalesced and reads are serialized. A snapshot that would overwrite a newly made local edit is discarded and retried. Pending owner/manager writes sync before refreshing; queued native photos remain in place.
- Initial subscriptions, reconnects and foregrounding re-read current data. A periodic recovery read runs when sockets are unavailable, with a slower safety read when connected. Offline writes become visible to other devices after they reach the server.

Hosted Realtime is enabled by migration `20261117140000_live_updates.sql`. The laptop gate intentionally still refuses WebSocket upgrades; laptop-server builds use the automatic recovery polling instead (up to about 30 seconds). Hosted builds receive immediate Broadcast events. This is shared data synchronization, not over-the-air delivery of new application code.

New shared tables added in later migrations must install `kiln_live_change` too. The notifier is server-only; authenticated clients have no broadcast-write policy. The existing owner, manager and crew data permissions remain the authority.

Validation: 160 app tests, 323 database assertions, four gateway tests, lint and typecheck passed. A hosted integration test connected separate owner and crew clients, assigned a job, added a crew receipt, then unassigned the job. Both clients received each change and fresh permitted reads reflected it. Temporary test accounts and data were removed. Haptic feel requires checking on a physical phone.

Before deployment, the hosted public schema was backed up to `builds/backups/hosted-schema-before-live-2026-11-17.sql` (ignored by git).
