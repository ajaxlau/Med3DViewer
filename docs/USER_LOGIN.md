# Login and workspace sharing

This flow uses the sharing accounts already assigned in **/admin/shares → Sharing users**. The administrator password remains administration-only.

## Publish a workspace

1. Click the **user icon** beside Analytic Tools in the header. Enter your assigned sharing username and password in the small login window.
2. Load a supported self-contained Dropbox STL, 3MF or GLB, or open an existing public model-only link, then open **Share model**. The source stays concealed when creating a workspace from a model-only link.
3. After login, select **Share workspace**, enter its **Workspace name** and **Expiry Date**, then create the link. Expiry must be in the future and at most 180 days from creation.
4. Share the generated QR/address through the existing Copy Link or WhatsApp controls. The original Dropbox address is excluded. Model-only links are reused across dialog openings and browser reloads to avoid duplicate metadata records; reuse does not renew their expiry. A model-only address derived from a workspace omits its analytics and inherits that workspace’s expiry and revocation.

Without login, Share keeps the legacy screen: its instruction, QR code, protected address, Close, WhatsApp and Copy Link. The link is prepared automatically. The workspace checkbox appears only after login. With the checkbox selected, re-sharing an existing workspace uses the current login and keeps its original address, name, history and expiry; the admin manager controls changes to existing names/deadlines.

## Open and update a shared workspace

Recipients need **no login or password**. Open **Analytic Tools** and expand **Workspace Revision**, between **Analytics** and **Project IO**, for revision and display-name controls. Use its pin to keep it expanded; unpinned sections minimize 10 seconds after the pointer leaves, except while a field is focused or a request is running. Re-entering restarts the delay. Matching pin and expand controls are used across the main sections of both tool menus. Touch users expand/collapse explicitly. The section can retract independently; closing Analytic Tools keeps its state. History is fetched when first expanded. Expiry and display-name notices are omitted from this compact interface; server expiry checks still apply.

Recipients can modify supported analytical objects and mesh show/hide/opacity. They enter a display name and explicitly click **Save Workspace** to publish a new revision. The first Save click expands the name field if needed; it does not silently save under an empty name. Selecting a historical revision loads it immediately and replaces local unsaved changes; there is no separate Load button. Rapid selections cancel older requests so late responses cannot replace the latest selection. Loading never saves. A subsequent Save creates a new revision, and simultaneous recipients each append a distinct snapshot, numbered in increasing server save-time order even if their tabs started from an older revision. No save is retried automatically.

Existing admin view-only settings remain enforced. Legacy records upgraded from schema 2 start with editing disabled; the admin must enable **Public view + public editing** for those records. New workspace links enable recipient saves by default. Display names are self-reported, not recipient accounts.

## Session and permissions foundation

- The login lasts up to eight hours. Reloading the page restores identity through a same-origin session endpoint; the application does not persist passwords or bearer tokens in Web Storage.
- The cookie is host-only, Secure, HttpOnly and SameSite=Strict. It contains a signed opaque session reference bound to its environment/origin; session identifiers are hashed in D1.
- Logout deletes its server-side session marker. Sharing-user password changes and enable/disable actions invalidate that user's existing sessions through the credential version checked on each protected request.
- Sessions reuse the existing scheduled-expiry table under a separate `session:` namespace. They are capped at 10 per user and 500 globally, and use indexed prefix lookups. The current schema-3 database, bindings and secrets suffice: **no new SQL migration or Cloudflare setting is required**.
- `UserSessionProvider` / `useUserSession` expose identity and permission state for the interface. `readUserSession` / `requireUserPermission` enforce permissions at the Worker. The current granted capability is `workspace:share`; future advanced capabilities must be assigned and checked on the server. Hiding a button is not authorization.
- Previously opened clients may continue using the authenticated per-share credential API. The new interface uses login cookies and does not resend the password on each share. Public model downloads and recipient saves continue to omit login credentials.

The existing 20-revision, 64 MiB history budget, source validation, fixed maximum lifetime and revocation/cleanup policies remain in force. Files stay at Dropbox; the platform stores workspace metadata only.
