# To Do

Running list of to-dos for Rick. Add items as they come up; check them off when done.

## Open

### Admin > Organizations tab
- [ ] Add/remove and filter columns in the table
- [ ] Clicking a row opens the org inspector (same as clicking Details)
- [ ] Sort by # groups, # users, # violations, date created

### Admin > Users tab
- [ ] Add/remove and filter columns in the table
- [ ] Clicking a row opens the User inspector (same as clicking Details) — shows all aspects of the user as they relate to the platform

### Admin > Groups tab
- [ ] "New Group" opens a modal for advanced group permission setup
- [ ] Support group templates

### Admin > Roles & Permissions tab
- [ ] Create new roles + role templates
- [ ] Add/remove and filter table headers
- [ ] Clicking a row inspects that role's permissions as they relate to orgs, users, groups, etc.
- [ ] Role-to-group binding: e.g. a "Moderators" role applied to a "Moderators" group gives all members that same role set
- [ ] Expand Permission catalog: collapsible sections by service, permissions assignable to services, and applicable to groups/roles

### Admin > Directory tab
- [ ] Actions bubble (Create User / Import Users / Export Users) isn't wired to code — implement
- [ ] Same for the Groups and Roles action bubbles

### Jobs and Queues
- [ ] Moderation Settings: support Exprsn moderation, an external service (e.g. Bluesky), or both
- [ ] "Require Approval for New Posts": support a lowcode-platform workflow, a lowcode app execution, or a webhook

### Groups (Nexus)
- [ ] Groups tab: advanced group creation modal + group template options
- [ ] Calendar tab: group calendars, group contact lists, CardDAV/CalDAV protocol support per group

### Bugs
- [ ] Config > Events: `invalid input syntax for type bigint: "Wed Jul 01 2026 21:37:38 GMT+0000 (Coordinated Universal Time)"` — JS date string being passed where a bigint/timestamp is expected

## Done

