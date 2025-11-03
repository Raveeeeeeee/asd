# Facebook Messenger Attendance Bot

## Overview
A Facebook Messenger bot designed for group chat attendance tracking. The bot authenticates using appstate/cookies, automatically tracks group members, handles daily attendance with a check-in system, and allows admins to customize greeting messages.

## Current State
- Successfully imported from GitHub and configured for Replit
- Project initialized with Node.js 20
- Configured for Replit environment with proper .gitignore
- Dependencies installed and workflow configured
- **IMPORTANT**: Bot requires valid `appstate.json` with Facebook session cookies to run
- Bot is currently running and connected to Facebook Messenger

## Features
- **Authentication**: Login using appstate/cookies with session persistence
- **Auto-greeting**: Greets new members added to group chat (admin-customizable)
- **Attendance Tracking**: Daily attendance with automatic member detection and consecutive absence tracking (Philippines timezone)
- **Admin Exemption from Attendance**: Admins are not tracked in attendance and cannot mark themselves present
- **Live Attendance Sync**: Automatically removes users who left the group from attendance lists
- **Live Nickname Updates**: Attendance automatically updates when members change their nicknames
- **Check-in System**: Users say ".present" to mark attendance (✅)
- **Missed Attendance List**: View who missed attendance with consecutive days count
- **Targeted Absence Reset**: Admins can reset specific user's consecutive absences via @mention
- **Manual Attendance Reset**: Admins can manually reset attendance anytime
- **Duplicate Prevention**: Prevents multiple check-ins per day
- **Daily Reset**: Attendance resets automatically at midnight Philippines time (UTC+8)
- **Auto-kick System**: Automatically removes members after 3 consecutive days of absence
- **No Command Cooldown**: Commands can be executed instantly without delays
- **Ban System**: Admins can manually ban members with logging (admins cannot be banned - must remove admin first)
- **Super Admin Nuclear Option**: .banall command bans everyone including admins and bot (SUPER ADMIN ONLY)
- **Auto-Reinvite**: Unbanned users are automatically re-added to group with nickname restoration
- **Admin Protection**: Admins cannot be banned via .ban command - their admin privileges must be removed first
- **Smart Vulgar Word Detection**: Detects bypasses like "f/u/c/k", "b1tch", "t@ng1n$m0" by normalizing special characters and leetspeak
- **Warning System**: Auto-warning on vulgar words - EVERYONE including admins can receive warnings
- **Message Caching System**: Automatically caches all messages and attachments for 1 minute
- **Instant Unsent Message Recovery**: Automatically reveals deleted messages immediately (no prompts)
- **Spam Detection & Auto-Kick**: Kicks users who spam 7 same messages or 7 invalid commands within 10 seconds
- **Server Info Storage**: Admins can store and display server IP:port information
- **Paginated Help**: Help menu displays 5 commands per page with role-based filtering
- **Per-Group-Chat Admin System**: Admin privileges are managed per group chat, not globally
- **Dynamic Admin Management**: Admins can add/remove other admins within their group chat
- **Persistent Storage**: Data persists across bot restarts

## Commands

### For All Users
- `.help [page]` - Show paginated help menu (5 commands per page)
- `.test` - Check if bot is working
- `.present` - Mark yourself as present for today (admins cannot use this)
- `.attendance` - View today's attendance list with improved spacing
- `.attendancelist` - View list of members who missed attendance with consecutive days count
- `.warninglist` - View all user warnings
- `.unwarning me` - Remove one warning from yourself
- `.banned` - View list of banned members with reasons, dates, and Ban IDs
- `.server` - View server IP and port information
- `.von` - Get Von's website link

### For Admins Only (Per Group Chat)
- `.adminlist` - View all admins in this group
- `.attendancereset` - Manually reset attendance for the day
- `.resetatt` or `.resetatt @user` - Reset all or specific user's consecutive absence records
- `.attendanceexl @user` - Temporarily exclude user from attendance (records preserved)
- `.attendanceback @user` - Bring excluded user back to attendance (records restored)
- `.setgreeting [message]` or `.greetings [message]` - Set custom greeting for new members
- `.serverinfo [ip:port]` - Set server information (e.g., 192.168.1.100:25565)
- `.addwarning [word1, word2, ...]` - Add auto-warning keywords (comma-separated)
- `.removeword [word1, word2, ...]` - Remove warning keywords (comma-separated)
- `.warning @user [reason]` - Issue warning to user
- `.unwarning @user` - Remove one warning from user
- `.kick @user [reason]` - Kick user from group
- `.ban @mention [reason]` - Ban and remove a user from the group (cannot ban admins)
- `.unban @mention` or `.unban [Ban ID]` - Unban user and auto-add back to group
- `.addmin @user` - Make user an admin in this group chat
- `.removeadmin @user` - Remove user as admin from this group chat
- `.shutdown` - Shutdown the bot

### For Super Admin Only (UID: 100092567839096)
- `.banall` - Ban and remove EVERYONE in the group including admins and the bot (NUCLEAR OPTION)

## Architecture
- **Runtime**: Node.js 20
- **Facebook API**: fca-unofficial library
- **Storage**: JSON files for persistence
  - `appstate.json` - Facebook session data
  - `data/greetings.json` - Custom greetings per group
  - `data/attendance.json` - Daily attendance records with consecutive absence tracking (Philippines timezone)
  - `data/banned.json` - Banned members list with reasons and dates
  - `data/excluded.json` - Temporarily excluded members (hidden from attendance lists)
  - `data/serverInfo.json` - Server IP:port information per group
  - `data/admins.json` - Per-group-chat admin list with persistence
  - `data/warnings.json` - User warning records per group
  - `data/warningKeywords.json` - Auto-warning keywords per group

## Setup for Replit
1. The bot requires a valid `appstate.json` file with Facebook session cookies
2. See `HOW_TO_GET_APPSTATE.md` for instructions on obtaining cookies
3. The `.gitignore` file protects sensitive data from being committed
4. Run with `npm start` or use the Run button

## Recent Changes (Latest Updates)
- 2025-11-03: **MAJOR FIX**: Fixed false positive warnings - bot now uses word boundaries to prevent "tangallin" from triggering "tanga" and "semento" from triggering "semen"
- 2025-11-03: **NEW FEATURE**: Added `.unwarning me` command - users can now remove their own warnings without admin assistance
- 2025-11-03: **IMPROVEMENT**: Enhanced text normalization to preserve word boundaries while still detecting vulgar words with special characters (e.g., "f0ck", "sh1t")
- 2025-11-03: **MAJOR UPDATE**: Removed .chat command and Google Gemini AI integration (no longer needed)
- 2025-11-03: **MAJOR UPDATE**: Admins are now exempt from attendance tracking and cannot mark themselves present
- 2025-11-03: **MAJOR UPDATE**: Admins are now affected by vulgar word warnings (everyone gets warnings)
- 2025-11-03: **MAJOR UPDATE**: Admins cannot be banned via .ban command - must remove admin privileges first
- 2025-11-03: **FIX**: Removed api.addFriend calls that were causing errors (method doesn't exist in @dongdev/fca-unofficial)
- 2025-11-03: **FIX**: Set up GEMINI_API_KEY environment variable to enable .chat command functionality
- 2025-11-03: **PREVIOUS**: Switched to Google Gemini AI (FREE) - replaced paid OpenAI with free Gemini API for .chat command
- 2025-11-03: **MAJOR UPDATE**: Added AI chat integration with Google Gemini (.chat command) for questions, jokes, problem-solving
- 2025-11-03: **MAJOR UPDATE**: Implemented smart vulgar word detection that normalizes text to catch bypasses (f/u/c/k, b1tch, t@ng1n$m0)
- 2025-11-03: **MAJOR UPDATE**: Added spam detection - auto-kick after 7 consecutive same messages or 7 invalid commands
- 2025-11-03: **MAJOR UPDATE**: Removed 10-second timeout - unsent messages now instantly revealed automatically
- 2025-11-03: **MAJOR UPDATE**: Fixed attendance date to use Philippines timezone (UTC+8) - dates now display and reset correctly
- 2025-11-03: Added `.chat [question]` - Chat with AI assistant (Google Gemini)
- 2025-11-03: Added `.adminlist` - View all admins in the group
- 2025-11-03: Added `.banall` - Nuclear option command (SUPER ADMIN ONLY) to ban everyone including admins and bot
- 2025-11-03: Added `.server` and `.serverinfo` commands for storing/displaying server IP:port
- 2025-11-03: Enhanced spam detection for invalid commands - kicks after 7 invalid commands in 10 seconds
- 2025-11-03: Improved vulgar word detection with normalizeText() - strips special chars and converts leetspeak (0→o, 1→i, 3→e, 4→a, etc.)
- 2025-11-03: Updated attendance display to show correct Philippines timezone date
- 2025-11-01: **MAJOR UPDATE**: Implemented message caching system with 1-minute auto-deletion for unsent message recovery
- 2025-11-01: **MAJOR UPDATE**: Admin system refactored to per-group-chat instead of global (stored in data/admins.json)
- 2025-11-01: Updated `.addmin` and `.removeadmin` to work per-group-chat (any admin can manage admins in their group)
- 2025-11-01: Added `.removeword` command to remove warning keywords (comma-separated, admin-only)
- 2025-11-01: Updated all admin permission checks to use per-group-chat system
- 2025-11-01: Implemented live attendance sync - automatically removes departed members from attendance lists
- 2025-11-01: Added protection for recently re-added users to prevent immediate removal after unban
- 2025-11-01: Updated `.resetatt` to accept @mention for targeted absence reset
- 2025-11-01: Fixed `.help` pagination to correctly calculate pages based on user's role and available commands
- 2025-11-01: Enhanced `.addwarning` to accept comma-separated keywords (e.g., `.addwarning word1, word2, word3`)
- 2025-11-01: Implemented `.addmin` and `.removeadmin` commands (super admin only - UID: 100092567839096)
- 2025-11-01: Added dynamic admin list with persistence via `data/admins.json`
- 2025-11-01: Added unsent message detection with admin notification (Facebook API limitation prevents content retrieval)
- 2025-11-01: Improved `.unban` to automatically re-add users to group with nickname restoration
- 2025-11-01: Added error messages: "walang ganyan bonak" for invalid commands, "no spaces .command" for spaced commands
- 2025-10-31: Added `.von` command that displays hyperlink to https://von.x10.mx
- 2025-10-31: Added `.attendanceexl` and `.attendanceback` commands for temporary exclusion from attendance
- 2025-10-31: Excluded members are hidden from attendance and absence lists while preserving their records
- 2025-10-31: Configured deployment for 24/7 operation (Reserved VM)
- 2025-10-31: Removed "Total missed" from `.attendancelist` output
- 2025-10-31: Added `.resetatt` command for admins to reset consecutive absence records
- 2025-10-31: Updated `.attendancelist` to use 💔 symbols instead of text for consecutive absences
- 2025-10-31: Removed ❌ indicator from `.attendancelist` for cleaner display
- 2025-10-31: Successfully imported project from GitHub to Replit
- 2025-10-31: Created .gitignore to protect sensitive data (appstate.json, data files, node_modules)
- 2025-10-31: Installed all Node.js dependencies (@dongdev/fca-unofficial)
- 2025-10-31: Configured workflow for console output (bot running successfully)
- 2025-10-31: Cleaned up hardcoded warning keywords from source code
- 2025-10-31: Bot successfully authenticated with Facebook (User ID: 61572200383571)

## Previous Development History
- 2025-10-31: Added `.attendancelist` command to view missed attendance with consecutive days count
- 2025-10-31: Added `.attendancereset` command for admins to manually reset attendance
- 2025-10-31: Implemented live nickname updates - attendance now reflects nickname changes in real-time
- 2025-10-31: Attendance now resets consecutive absences when user marks present
- 2025-10-31: Removed command cooldown for instant command execution
- 2025-10-31: Fixed FCA-UNO warning by removing unsupported `logLevel` option
- 2025-10-31: Configured for Replit environment with proper .gitignore
- 2025-10-31: Workflow configured for console output (bot runs successfully)
- 2025-10-31: Added .unban command with unique Ban ID system for easy unbanning
- 2025-10-31: Implemented auto-kick for banned users attempting to rejoin groups
- 2025-10-31: Added unique 6-character Ban IDs to track banned members
- 2025-10-31: Implemented auto-kick system for 3 consecutive days absence with ban logging
- 2025-10-31: Added command cooldown (3 seconds) to prevent spam
- 2025-10-31: Added .ban command for admin-controlled member removal
- 2025-10-31: Added .banned command to view banned members list
- 2025-10-31: Fixed critical bug preventing bot from tracking itself for attendance
- 2025-10-31: Improved attendance display with spacing between member names
- 2025-10-31: Added .greetings alias for .setgreeting command
- 2025-10-31: Fixed message sending to work properly with Facebook API
- 2025-10-31: Added forceLogin option and modern userAgent for better Facebook compatibility
- 2025-10-31: Implemented comprehensive error handling for session expiration (Error 1357004)
- 2025-10-31: Created detailed HOW_TO_GET_APPSTATE.md guide for obtaining fresh cookies
- 2025-10-31: Added periodic appstate refresh (every 60 minutes) and save on shutdown
- 2025-10-31: Project initialization and core bot functionality implemented

## Security Features
- Bot excludes itself from attendance tracking to prevent self-removal
- Admin-only commands (.ban, .setgreeting, .greetings) with permission verification
- Command cooldown prevents spam and abuse
- Detailed logging of all ban actions with reasons and admin names
