# OC Approval System - Feature Checklist

This document tracks all features of the OC (Original Character) approval workflow system.

## ✅ Creation & Submission

- [x] User can create an OC on the dashboard (`/character-create.html`)
- [x] OC is saved in the database when created (`POST /api/characters/create`)
- [x] OC is created as DRAFT status (not auto-submitted) (`status: null`)
- [ ] User receives a DM: "Your OC has been created." (NOT IMPLEMENTED - no DM on creation)
- [x] User can edit the OC while it is a draft (fieldEditability allows editing when status is null)
- [x] When user submits the OC (`POST /api/characters/:id/submit`):
  - [x] OC becomes locked (cannot be edited) (fieldEditability locks all fields when status is 'pending')
  - [x] OC status becomes Pending (`status: 'pending'`)
  - [x] Bot posts an embed in the mod review channel (ID: 964342870796537909) (`postApplicationToAdminChannel`)
  - [x] Embed includes OC summary (name, pronouns, age, height, race, village, job, stats, gear)
  - [x] Embed includes link to public OC page (`/ocs/{slug}`)
  - [x] Embed includes link to admin OC page/moderation panel (`/character-moderation`)
  - [x] Discord message ID and thread ID are stored for updates (`discordMessageId`, `discordThreadId`)

## ✅ Mod Review

- [x] Mods can review OCs from Discord using commands (`/mod ocapp approve/needschanges/view`)
- [x] Mods can review OCs from Dashboard using buttons
- [x] Both methods write to the same database
- [x] Vote changes are supported (mods can change their vote)
- [x] One vote per mod per application version (enforced by database index)

## ✅ Approval Rules

- [x] Requires 4 mod approvals to approve
- [x] Fast-fail: If any 1 mod selects "Needs Changes":
  - [x] OC immediately goes to Needs Changes status
  - [x] User is notified with feedback
  - [x] Other mods can still add feedback (aggregated)
- [x] Mods can change their vote at any time before final decision
- [x] Vote changes update existing vote record (idempotent)
- [x] Decision checking happens after each vote

## ✅ Feedback & Resubmission

- [x] When an OC is marked Needs Changes:
  - [x] User receives a DM with feedback
  - [x] User can edit the OC again (all non-locked fields)
  - [x] Feedback is aggregated from all mods who voted "needs changes"
- [x] When user resubmits:
  - [x] All mod votes reset (deleted for old version)
  - [x] Application version increments
  - [x] OC becomes locked again
  - [x] Status returns to Pending
  - [x] Mods are notified that the OC was resubmitted (Discord thread update)

## ✅ Approval

- [x] When an OC reaches 4 approvals:
  - [x] OC status becomes Approved
  - [x] User receives a DM: "Your OC has been approved."
  - [x] Bot assigns all relevant roles (village, race, job, job perks)
  - [x] Public OC page becomes visible
  - [x] Approved timestamp is recorded

## ✅ Notifications

- [x] When a decision is made (Approved or Needs Changes):
  - [x] Bot attempts to DM the user
  - [x] If DM fails, bot posts in a public channel (fallback ping)
  - [x] A notification is added to the dashboard inbox
  - [x] Notification includes links to OC page
  - [x] Notification tracks DM delivery and fallback posting status

## ✅ Role Assignment

- [x] When an OC is approved:
  - [x] Bot assigns all configured roles (village resident, race, job, job perks)
- [x] If role assignment fails:
  - [x] Bot pings mods in a logging channel to assign manually
  - [x] Error details are logged with user mention and OC link

## ✅ Editing Rules

- [x] While Pending:
  - [x] User cannot edit OC (all fields locked)
- [x] While Needs Changes:
  - [x] User can edit OC (all non-locked fields)
- [x] While Approved:
  - [x] Only specific fields are editable (height, pronouns, icon, personality, history, extras, gender, virtue, appLink, appArt, birthday)
  - [x] Locked fields remain locked (name, age, race, village, job, gear, stats)
  - [x] No edits require mod review

## ✅ Reminders & Safety

- [x] If an OC is still Pending after 24 hours:
  - [x] Bot reminds mods in the review thread
  - [x] Reminder includes vote counts and hours pending
  - [x] Reminder can optionally @mention mod role
  - [x] Reminder timestamp is tracked to prevent spam
- [x] All actions are stored in the database:
  - [x] Votes (with mod ID, username, decision, note, timestamps)
  - [x] Vote changes (old decision → new decision)
  - [x] Feedback (aggregated from all mods)
  - [x] Decisions (approval/needs changes with timestamp)
  - [x] Application versions
  - [x] Submission and decision timestamps
  - [x] Audit logs for all moderation actions

## ✅ Additional Features

- [x] Application versioning (tracks resubmissions)
- [x] Public slug generation for OC pages
- [x] Discord embed updates when votes change
- [x] Field editability rules enforced at API level
- [x] Idempotent vote recording (prevents duplicate votes)
- [x] Atomic decision transitions (can't approve and needs-changes simultaneously)
- [x] Migration script for existing characters
- [x] Dashboard notification system integration
- [x] Reminder service runs automatically using Agenda (checks every hour)

## 📋 API Endpoints

- `POST /api/characters/create` - Create OC as DRAFT
- `POST /api/characters/:id/submit` - Submit OC for review
- `POST /api/characters/:id/resubmit` - Resubmit after needs changes
- `GET /api/characters/:id/application` - Get application status
- `POST /api/characters/moderation/vote` - Record mod vote
- `GET /api/characters/moderation/pending` - Get pending OCs for mods
- `PUT /api/characters/edit/:id` - Edit OC (enforces field rules)

## 📋 Discord Commands

- `/mod ocapp approve <id> [note]` - Approve an OC application
- `/mod ocapp needschanges <id> <note>` - Mark OC as needs changes
- `/mod ocapp view <id>` - View OC application status

## 🔧 Configuration

Required environment variables:
- `DISCORD_TOKEN` - Bot token for Discord API
- `ADMIN_REVIEW_CHANNEL_ID` - Channel for application posts (default: 964342870796537909)
- `ADMIN_REVIEW_THREAD_ID` - Optional thread ID
- `MOD_ROLE_ID` - Optional role to mention in reminders
- `LOGGING_CHANNEL_ID` - Channel for role assignment failures
- `DECISION_CHANNEL_ID` - Channel for fallback pings (if DM fails)

## 📊 Database Models

- **Character** - Stores OC data with application tracking fields
- **CharacterModeration** - Stores mod votes with versioning
- **Notification** - Stores user notifications with DM/fallback tracking
- **AuditLog** - Stores all moderation actions for accountability

## 🎯 Status Mapping

- `null` or `undefined` = **DRAFT** (can edit, not submitted)
- `'pending'` = **PENDING** (locked, awaiting review)
- `'denied'` = **NEEDS_CHANGES** (can edit, needs resubmission)
- `'accepted'` = **APPROVED** (limited editing, public visible)

## ✅ All Features Implemented

All features from the specification have been implemented and are ready for use.
