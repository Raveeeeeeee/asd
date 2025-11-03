const login = require("@dongdev/fca-unofficial");
const fs = require("fs");
const path = require("path");
const DataManager = require("./dataManager");

const APPSTATE_FILE = "appstate.json";
const COMMAND_COOLDOWN = 3000;
const data = new DataManager();

const SUPER_ADMIN_ID = "100092567839096";
let ADMIN_IDS = [
  "61561144200531",
  "100043486073592",
  "100092567839096",
  "61561004878878",
  "61559295856089",
];

let api = null;
let botUserId = null;
const userCooldowns = new Map();
const unsentMessageHandlers = new Map();
const recentlyAddedUsers = new Map();
const pendingUnsendPrompts = new Map();
const userMessageHistory = new Map();
const spamDetection = new Map();

function isAdmin(threadID, userID) {
  if (userID === SUPER_ADMIN_ID) {
    return true;
  }
  
  const groupAdmins = data.getGroupAdmins(threadID);
  return groupAdmins.includes(userID);
}

function loadAppState() {
  if (fs.existsSync(APPSTATE_FILE)) {
    try {
      const appState = JSON.parse(fs.readFileSync(APPSTATE_FILE, "utf8"));
      console.log("✓ Loaded existing appstate");
      return appState;
    } catch (error) {
      console.error("✗ Failed to load appstate:", error.message);
      return null;
    }
  }
  console.log("⚠ No appstate.json found. Please login first.");
  console.log("To login: Create appstate.json with your Facebook session cookies");
  return null;
}

function saveAppState(appState) {
  try {
    fs.writeFileSync(APPSTATE_FILE, JSON.stringify(appState, null, 2));
    console.log("✓ Appstate saved");
  } catch (error) {
    console.error("✗ Failed to save appstate:", error.message);
  }
}

async function initializeBot() {
  const appState = loadAppState();
  
  if (!appState) {
    console.error("\n=== LOGIN REQUIRED ===");
    console.error("Please create an appstate.json file with your Facebook session.");
    console.error("You can get this from your browser cookies after logging into Facebook.");
    process.exit(1);
  }

  console.log("🤖 Starting bot login...");
  
  const savedAdmins = data.loadAdminList();
  if (savedAdmins.length > 0) {
    ADMIN_IDS = savedAdmins;
    console.log("✓ Loaded admin list:", ADMIN_IDS);
  }
  
  const loginOptions = {
    forceLogin: true,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    listenEvents: true,
    autoMarkDelivery: false,
    autoMarkRead: false,
    online: true,
    selfListen: false
  };
  
  return new Promise((resolve, reject) => {
    login({ appState }, loginOptions, (err, fbApi) => {
      if (err) {
        console.error("✗ Login failed:", err);
        console.error("\n⚠️  Your appstate.json may be expired or invalid.");
        console.error("Please get fresh cookies from your browser and update appstate.json");
        reject(err);
        return;
      }

      console.log("✓ Login successful!");
      api = fbApi;
      
      botUserId = api.getCurrentUserID();
      console.log("✓ Bot User ID:", botUserId);

      api.setOptions({
        listenEvents: true,
        selfListen: false,
        updatePresence: true
      });

      saveAppState(api.getAppState());

      setupEventListeners();
      startDailyReset();
      startPeriodicAppStateSave();

      console.log("✓ Bot is now running and listening for messages...\n");
      resolve(api);
    });
  });
}

function setupEventListeners() {
  api.listenMqtt((err, event) => {
    if (err) {
      console.error("Listen error:", err);
      
      if (err.error === "Not logged in" || (err.res && err.res.error === 1357004)) {
        console.error("\n⚠️  SESSION EXPIRED!");
        console.error("Your appstate.json is no longer valid.");
        console.error("Please follow these steps:");
        console.error("1. Open Facebook in your browser and login");
        console.error("2. Use a cookie extension (EditThisCookie or Cookie-Editor) to export cookies");
        console.error("3. Replace the content of appstate.json with the fresh cookies");
        console.error("4. Restart the bot");
        process.exit(1);
      }
      return;
    }

    console.log("📨 Event received:", JSON.stringify(event, null, 2));

    try {
      handleEvent(event);
    } catch (error) {
      console.error("Event handling error:", error);
    }
  });
}

async function handleEvent(event) {
  switch (event.type) {
    case "message":
    case "message_reply":
      await handleMessage(event);
      break;
    case "message_unsend":
      await handleUnsendMessage(event);
      break;
    case "event":
      await handleGroupEvent(event);
      break;
    default:
      console.log(`⚠️ Unhandled event type: ${event.type}`);
  }
}

async function handleMessage(event) {
  const { threadID, messageID, body, senderID, attachments } = event;

  console.log("💬 Message received:", {
    threadID,
    messageID,
    body,
    senderID
  });

  data.cacheMessage(messageID, threadID, senderID, body, attachments || []);

  if (!body) return;

  const message = body.trim();
  
  await checkMessageSpam(threadID, messageID, senderID, message);
  
  await checkForVulgarWords(threadID, messageID, senderID, message, event);
  
  if (message.startsWith(". ")) {
    const command = message.substring(2).trim();
    sendMessage(threadID, `no spaces .${command}`, messageID);
    return;
  }
  
  console.log("🔍 Processing command:", message);
  
  if (!message.startsWith(".")) return;
  
  if (message === ".help" || message.startsWith(".help ")) {
    console.log("✅ Executing .help command");
    await handleHelpCommand(threadID, messageID, senderID, message);
  } else if (message === ".test") {
    console.log("✅ Executing .test command");
    sendMessage(threadID, "Bot is working! All systems operational.", messageID);
  } else if (message === ".present") {
    console.log("✅ Executing .present command");
    await handlePresentCommand(threadID, messageID, senderID);
  } else if (message === ".attendance") {
    console.log("✅ Executing .attendance command");
    await handleAttendanceCommand(threadID, messageID);
  } else if (message === ".attendancelist") {
    console.log("✅ Executing .attendancelist command");
    await handleAttendanceListCommand(threadID, messageID);
  } else if (message === ".attendancereset") {
    console.log("✅ Executing .attendancereset command");
    await handleAttendanceResetCommand(threadID, messageID, senderID);
  } else if (message === ".resetatt" || message.startsWith(".resetatt ")) {
    console.log("✅ Executing .resetatt command");
    await handleResetAttCommand(threadID, messageID, senderID, event);
  } else if (message.startsWith(".attendanceexl ")) {
    console.log("✅ Executing .attendanceexl command");
    await handleAttendanceExcludeCommand(threadID, messageID, senderID, event);
  } else if (message.startsWith(".attendanceback ")) {
    console.log("✅ Executing .attendanceback command");
    await handleAttendanceIncludeCommand(threadID, messageID, senderID, event);
  } else if (message.startsWith(".setgreeting ") || message.startsWith(".greetings ")) {
    console.log("✅ Executing .setgreeting command");
    await handleSetGreetingCommand(threadID, messageID, senderID, message);
  } else if (message === ".banned") {
    console.log("✅ Executing .banned command");
    await handleBannedCommand(threadID, messageID);
  } else if (message.startsWith(".addwarning ")) {
    console.log("✅ Executing .addwarning command");
    await handleAddWarningKeywordCommand(threadID, messageID, senderID, message);
  } else if (message.startsWith(".removeword ")) {
    console.log("✅ Executing .removeword command");
    await handleRemoveWarningKeywordCommand(threadID, messageID, senderID, message);
  } else if (message.startsWith(".warning ")) {
    console.log("✅ Executing .warning command");
    await handleManualWarningCommand(threadID, messageID, senderID, event);
  } else if (message.startsWith(".unwarning ")) {
    console.log("✅ Executing .unwarning command");
    await handleUnwarningCommand(threadID, messageID, senderID, event);
  } else if (message === ".warninglist") {
    console.log("✅ Executing .warninglist command");
    await handleWarningListCommand(threadID, messageID);
  } else if (message.startsWith(".ban ")) {
    console.log("✅ Executing .ban command");
    await handleBanCommand(threadID, messageID, senderID, event);
  } else if (message.startsWith(".unban ")) {
    console.log("✅ Executing .unban command");
    await handleUnbanCommand(threadID, messageID, senderID, event);
  } else if (message === ".shutdown") {
    console.log("✅ Executing .shutdown command");
    await handleShutdownCommand(threadID, messageID, senderID);
  } else if (message.startsWith(".kick ")) {
    console.log("✅ Executing .kick command");
    await handleKickCommand(threadID, messageID, senderID, event);
  } else if (message === ".von") {
    console.log("✅ Executing .von command");
    await handleVonCommand(threadID, messageID);
  } else if (message.startsWith(".addmin ")) {
    console.log("✅ Executing .addmin command");
    await handleAddAdminCommand(threadID, messageID, senderID, event);
  } else if (message.startsWith(".removeadmin ")) {
    console.log("✅ Executing .removeadmin command");
    await handleRemoveAdminCommand(threadID, messageID, senderID, event);
  } else if (message === ".adminlist") {
    console.log("✅ Executing .adminlist command");
    await handleAdminListCommand(threadID, messageID);
  } else if (message === ".banall") {
    console.log("✅ Executing .banall command");
    await handleBanAllCommand(threadID, messageID, senderID);
  } else if (message === ".server") {
    console.log("✅ Executing .server command");
    await handleServerCommand(threadID, messageID);
  } else if (message.startsWith(".serverinfo ")) {
    console.log("✅ Executing .serverinfo command");
    await handleServerInfoCommand(threadID, messageID, senderID, message);
  } else {
    await handleInvalidCommand(threadID, messageID, senderID, message);
  }
}

function checkCooldown(senderID, threadID) {
  const key = `${threadID}_${senderID}`;
  const now = Date.now();
  const lastCommand = userCooldowns.get(key);

  if (lastCommand && now - lastCommand < COMMAND_COOLDOWN) {
    return false;
  }

  userCooldowns.set(key, now);
  return true;
}

async function handleHelpCommand(threadID, messageID, senderID, message) {
  const userIsAdmin = isAdmin(threadID, senderID);
  
  const pageMatch = message.match(/\.help\s+(\d+)/);
  const requestedPage = pageMatch ? parseInt(pageMatch[1]) : 1;
  
  const userCommands = [
    ".help - Show this help menu",
    ".test - Check if bot is online",
    ".present - Mark yourself present in attendance",
    ".attendance - View daily attendance list",
    ".attendancelist - View list of members who missed attendance",
    ".warninglist - View all user warnings",
    ".banned - View banned members list",
    ".server - View server IP and port information",
    ".von - Get Von's website link"
  ];
  
  const adminCommands = [
    ".adminlist - View all admins in this group",
    ".attendancereset - Manually reset attendance",
    ".resetatt @user - Reset specific user's absence records",
    ".attendanceexl @user - Temporarily exclude user from attendance",
    ".attendanceback @user - Bring excluded user back to attendance",
    ".setgreeting [text] - Set custom welcome message",
    ".serverinfo [ip:port] - Set server information",
    ".addwarning [word1, word2, ...] - Add auto-warning keywords",
    ".removeword [word1, word2, ...] - Remove warning keywords",
    ".warning @user [reason] - Issue warning to user",
    ".unwarning @user - Remove one warning from user",
    ".kick @user [reason] - Kick user from group",
    ".ban @user [reason] - Ban and remove user",
    ".unban [Ban ID] - Unban user and add back to group",
    ".addmin @user - Make user an admin in this group",
    ".removeadmin @user - Remove user as admin from this group",
    ".shutdown - Shutdown the bot"
  ];

  const superAdminCommands = [
    ".banall - Ban everyone in the group (SUPER ADMIN ONLY)"
  ];
  
  let availableCommands = [...userCommands];
  if (userIsAdmin) {
    availableCommands = availableCommands.concat(adminCommands);
  }
  if (senderID === SUPER_ADMIN_ID) {
    availableCommands = availableCommands.concat(superAdminCommands);
  }
  
  const commandsPerPage = 5;
  const totalPages = Math.ceil(availableCommands.length / commandsPerPage);
  
  if (requestedPage < 1 || requestedPage > totalPages) {
    sendMessage(threadID, `❌ Invalid page number. You have access to pages: 1-${totalPages}`, messageID);
    return;
  }
  
  const startIndex = (requestedPage - 1) * commandsPerPage;
  const endIndex = Math.min(startIndex + commandsPerPage, availableCommands.length);
  const pageCommands = availableCommands.slice(startIndex, endIndex);
  
  let helpMessage = `🤖 Bot Commands (Page ${requestedPage}/${totalPages})\n\n`;
  pageCommands.forEach(cmd => {
    helpMessage += `${cmd}\n\n`;
  });
  
  if (requestedPage < totalPages) {
    helpMessage += `\nType .help ${requestedPage + 1} for next page`;
  }
  
  sendMessage(threadID, helpMessage.trim(), messageID);
}

async function handlePresentCommand(threadID, messageID, senderID) {
  if (isAdmin(threadID, senderID)) {
    sendMessage(threadID, "❌ Admins are not tracked in attendance!", messageID);
    return;
  }

  const threadInfo = await getThreadInfo(threadID);
  if (!threadInfo) return;

  const userInfo = threadInfo.participantIDs.includes(senderID) 
    ? await getUserInfo(senderID)
    : null;

  if (!userInfo) {
    sendMessage(threadID, "You're not a member of this group!", messageID);
    return;
  }

  const nickname = threadInfo.nicknames?.[senderID] || userInfo.name;
  
  const alreadyPresent = data.markPresent(threadID, senderID, nickname);
  
  if (alreadyPresent) {
    sendMessage(threadID, "kanina kapa present engot.", messageID);
  } else {
    sendMessage(threadID, `✅ ${nickname} marked as present!`, messageID);
  }
}

async function handleAttendanceCommand(threadID, messageID) {
  console.log("🔍 Getting thread info for attendance...");
  const threadInfo = await getThreadInfo(threadID);
  if (!threadInfo) {
    console.log("❌ Failed to get thread info");
    sendMessage(threadID, "❌ Error: Could not retrieve group information.", messageID);
    return;
  }

  console.log("🔄 Updating group members...");
  await updateGroupMembers(threadID, threadInfo);

  console.log("📊 Getting attendance data...");
  const attendance = data.getAttendance(threadID);
  const today = data.getTodayDate();

  let message = `📋 Attendance for ${today}\n\n`;
  
  if (attendance.members.length === 0) {
    message += "No members found in this group.";
  } else {
    attendance.members.forEach(member => {
      const status = member.present ? "✅" : "❌";
      message += `${status} ${member.nickname}\n\n`;
    });
    
    const presentCount = attendance.members.filter(m => m.present).length;
    message += `📊 ${presentCount}/${attendance.members.length} present`;
  }

  console.log("📤 Sending attendance report...");
  sendMessage(threadID, message, messageID);
}

async function handleAttendanceListCommand(threadID, messageID) {
  console.log("🔍 Getting thread info for missed attendance...");
  const threadInfo = await getThreadInfo(threadID);
  if (!threadInfo) {
    console.log("❌ Failed to get thread info");
    sendMessage(threadID, "❌ Error: Could not retrieve group information.", messageID);
    return;
  }

  console.log("🔄 Updating group members...");
  await updateGroupMembers(threadID, threadInfo);

  console.log("📊 Getting missed attendance list...");
  const missedList = data.getMissedAttendanceList(threadID);
  const today = data.getTodayDate();

  let message = `📋 Missed Attendance for ${today}\n\n`;
  
  if (missedList.length === 0) {
    message += "✅ Everyone is present! No one has missed attendance today.";
  } else {
    missedList.forEach((member, index) => {
      const hearts = member.consecutiveAbsences > 0 
        ? ' ' + '💔'.repeat(member.consecutiveAbsences)
        : '';
      message += `${index + 1}. ${member.nickname}${hearts}\n\n`;
    });
  }

  console.log("📤 Sending missed attendance report...");
  sendMessage(threadID, message, messageID);
}

async function handleAttendanceResetCommand(threadID, messageID, senderID) {
  if (!isAdmin(threadID, senderID)) {
    sendMessage(threadID, "❌ Only admins can manually reset attendance!", messageID);
    return;
  }

  console.log("🔄 Admin manually resetting attendance...");
  const success = data.manualResetAttendance(threadID);
  
  if (success) {
    const adminInfo = await getUserInfo(senderID);
    const threadInfo = await getThreadInfo(threadID);
    const adminName = threadInfo?.nicknames?.[senderID] || adminInfo?.name || "Admin";
    
    sendMessage(threadID, `✅ Attendance has been manually reset by ${adminName}.\n\nAll members are now marked as absent. Use .present to mark yourself present.`, messageID);
    console.log(`✅ Attendance reset by ${adminName} (${senderID}) in thread ${threadID}`);
  } else {
    sendMessage(threadID, "❌ Error: Could not reset attendance.", messageID);
  }
}

async function handleResetAttCommand(threadID, messageID, senderID, event) {
  if (!isAdmin(threadID, senderID)) {
    sendMessage(threadID, "❌ Only admins can reset consecutive absences!", messageID);
    return;
  }

  const mentions = event.mentions || {};
  let mentionedUserIDs = Object.keys(mentions);
  
  if (mentionedUserIDs.length === 0) {
    if (event.messageReply && event.messageReply.senderID) {
      mentionedUserIDs = [event.messageReply.senderID];
    }
  }
  
  const adminInfo = await getUserInfo(senderID);
  const threadInfo = await getThreadInfo(threadID);
  const adminName = threadInfo?.nicknames?.[senderID] || adminInfo?.name || "Admin";
  
  if (mentionedUserIDs.length > 0) {
    const targetUserID = mentionedUserIDs[0];
    const userInfo = await getUserInfo(targetUserID);
    const nickname = threadInfo?.nicknames?.[targetUserID] || userInfo?.name || "User";
    
    console.log(`🔄 Admin resetting consecutive absences for ${nickname}...`);
    const success = data.resetConsecutiveAbsences(threadID, targetUserID);
    
    if (success) {
      sendMessage(threadID, `✅ Consecutive absence records have been reset for ${nickname} by ${adminName}.`, messageID);
      console.log(`✅ Consecutive absences reset for ${nickname} by ${adminName} (${senderID}) in thread ${threadID}`);
    } else {
      sendMessage(threadID, "❌ Error: User not found in attendance records.", messageID);
    }
  } else {
    sendMessage(threadID, "❌ Usage: .resetatt @mention\nMention a user to reset their consecutive absence records.\n\nAlternatively, reply to a message with: .resetatt", messageID);
  }
}

async function handleAttendanceExcludeCommand(threadID, messageID, senderID, event) {
  if (!isAdmin(threadID, senderID)) {
    sendMessage(threadID, "❌ Only admins can exclude members from attendance!", messageID);
    return;
  }

  const mentions = event.mentions || {};
  let mentionedUserIDs = Object.keys(mentions);
  
  if (mentionedUserIDs.length === 0) {
    if (event.messageReply && event.messageReply.senderID) {
      mentionedUserIDs = [event.messageReply.senderID];
    } else {
      sendMessage(threadID, "❌ Usage: .attendanceexl @mention\nMention a user to exclude them from attendance.\n\nAlternatively, reply to a message with: .attendanceexl", messageID);
      return;
    }
  }

  const targetUserID = mentionedUserIDs[0];
  const threadInfo = await getThreadInfo(threadID);
  const userInfo = await getUserInfo(targetUserID);
  
  if (!userInfo) {
    sendMessage(threadID, "❌ Could not retrieve user information.", messageID);
    return;
  }

  const nickname = threadInfo?.nicknames?.[targetUserID] || userInfo.name;
  const success = data.excludeMember(threadID, targetUserID, nickname);
  
  if (!success) {
    sendMessage(threadID, `❌ ${nickname} is already excluded from attendance.`, messageID);
    return;
  }

  sendMessage(threadID, `✅ ${nickname} has been temporarily excluded from attendance.\n\nThey will not appear in attendance lists or absence lists. Their records are preserved and will be restored when they are brought back.`, messageID);
  console.log(`✅ ${nickname} (${targetUserID}) excluded from attendance in thread ${threadID}`);
}

async function handleAttendanceIncludeCommand(threadID, messageID, senderID, event) {
  if (!isAdmin(threadID, senderID)) {
    sendMessage(threadID, "❌ Only admins can include members back into attendance!", messageID);
    return;
  }

  const mentions = event.mentions || {};
  let mentionedUserIDs = Object.keys(mentions);
  
  if (mentionedUserIDs.length === 0) {
    if (event.messageReply && event.messageReply.senderID) {
      mentionedUserIDs = [event.messageReply.senderID];
    } else {
      sendMessage(threadID, "❌ Usage: .attendanceback @mention\nMention a user to bring them back to attendance.\n\nAlternatively, reply to a message with: .attendanceback", messageID);
      return;
    }
  }

  const targetUserID = mentionedUserIDs[0];
  const member = data.includeMember(threadID, targetUserID);
  
  if (!member) {
    sendMessage(threadID, "❌ This user is not currently excluded from attendance.", messageID);
    return;
  }

  sendMessage(threadID, `✅ ${member.nickname} has been brought back to attendance.\n\nThey will now appear in attendance lists again with their records restored.`, messageID);
  console.log(`✅ ${member.nickname} (${targetUserID}) brought back to attendance in thread ${threadID}`);
}

async function handleSetGreetingCommand(threadID, messageID, senderID, message) {
  if (!isAdmin(threadID, senderID)) {
    sendMessage(threadID, "❌ Only admins can modify the greeting!", messageID);
    return;
  }

  let greeting;
  if (message.startsWith(".setgreeting ")) {
    greeting = message.substring(".setgreeting ".length).trim();
  } else if (message.startsWith(".greetings ")) {
    greeting = message.substring(".greetings ".length).trim();
  }
  
  if (!greeting) {
    sendMessage(threadID, "❌ Please provide a greeting message!", messageID);
    return;
  }

  data.setGreeting(threadID, greeting);
  sendMessage(threadID, `✅ Greeting updated!\n\nNew greeting: ${greeting}`, messageID);
}

async function checkMessageSpam(threadID, messageID, senderID, message) {
  if (isAdmin(threadID, senderID)) {
    return;
  }

  const key = `spam_${threadID}_${senderID}`;
  const now = Date.now();
  
  if (!spamDetection.has(key)) {
    spamDetection.set(key, { messages: [], lastReset: now });
  }

  const userSpam = spamDetection.get(key);
  
  if (now - userSpam.lastReset > 10000) {
    userSpam.messages = [];
    userSpam.lastReset = now;
  }

  userSpam.messages.push(message);

  if (userSpam.messages.length >= 7) {
    const allSame = userSpam.messages.every(msg => msg === userSpam.messages[0]);
    
    if (allSame) {
      const threadInfo = await getThreadInfo(threadID);
      const userInfo = await getUserInfo(senderID);
      const nickname = threadInfo?.nicknames?.[senderID] || userInfo?.name || "User";

      console.log(`🚫 Kicking ${nickname} for spamming the same message`);
      
      api.removeUserFromGroup(senderID, threadID, (err) => {
        if (err) {
          console.error(`Failed to kick spammer ${nickname}:`, err);
        } else {
          sendMessage(threadID, `👢 ${nickname} has been kicked.\n\nReason: Spamming (7 consecutive same messages)`);
        }
      });

      spamDetection.delete(key);
      return true;
    }
  }

  return false;
}

async function checkForVulgarWords(threadID, messageID, senderID, message, event) {
  const keywords = data.getWarningKeywords(threadID);
  
  const normalizedMessage = normalizeForDetection(message);
  
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeForDetection(keyword);
    const flexPattern = createFlexiblePattern(normalizedKeyword);
    
    if (flexPattern.test(normalizedMessage)) {
      await issueWarning(threadID, messageID, senderID, event, `Used vulgar word: "${keyword}"`);
      return;
    }
  }
}

function normalizeForDetection(text) {
  return text
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b');
}

function createFlexiblePattern(normalizedKeyword) {
  const chars = normalizedKeyword.split('');
  const pattern = chars.map(char => {
    if (char === ' ') {
      return '[^a-z]+';
    } else if (/[a-z]/.test(char)) {
      return char + '[^a-z]*';
    } else {
      return escapeRegex(char);
    }
  }).join('');
  
  const finalPattern = `(?<![a-z])${pattern.replace(/\[\^a-z\]\*$/, '')}(?![a-z])`;
  return new RegExp(finalPattern, 'i');
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function issueWarning(threadID, messageID, senderID, event, reason) {
  const threadInfo = await getThreadInfo(threadID);
  if (!threadInfo) return;
  
  const userInfo = await getUserInfo(senderID);
  if (!userInfo) return;
  
  const nickname = threadInfo.nicknames?.[senderID] || userInfo.name;
  const warningCount = data.addWarning(threadID, senderID, nickname, reason);
  
  const warningSymbols = "⛔".repeat(warningCount);
  
  if (warningCount >= 3) {
    const banReason = `Accumulated 3 warnings`;
    const uid = data.banMember(threadID, senderID, nickname, banReason, "System");
    data.clearWarnings(threadID, senderID);
    
    sendMessage(threadID, `⚠️ ${nickname} has been warned!\n\nReason: ${reason}\nWarnings: ${warningSymbols}\n\n❌ User has reached 3 warnings and will be kicked!`, messageID);
    
    api.removeUserFromGroup(senderID, threadID, (err) => {
      if (err) {
        console.error("Failed to remove user from group:", err);
      }
    });
  } else {
    sendMessage(threadID, `⚠️ ${nickname} has been warned!\n\nReason: ${reason}\nWarnings: ${warningSymbols}\n\n⚠️ Warning: You will be kicked at 3 warnings!`, messageID);
  }
}

async function handleAddWarningKeywordCommand(threadID, messageID, senderID, message) {
  if (!isAdmin(threadID, senderID)) {
    sendMessage(threadID, "❌ Only admins can add warning keywords!", messageID);
    return;
  }

  const keywordsText = message.substring(".addwarning ".length).trim();
  
  if (!keywordsText) {
    sendMessage(threadID, "❌ Usage: .addwarning [word1, word2, ...]\nExample: .addwarning fuck, shit, bitch", messageID);
    return;
  }

  const keywords = keywordsText.split(',').map(k => k.trim()).filter(k => k.length > 0);
  
  if (keywords.length === 0) {
    sendMessage(threadID, "❌ No valid keywords provided!", messageID);
    return;
  }

  const result = data.addWarningKeywords(threadID, keywords);
  
  let responseMessage = "";
  
  if (result.added.length > 0) {
    responseMessage += `✅ Warning keywords added: ${result.added.join(', ')}\n\n`;
  }
  
  if (result.skipped.length > 0) {
    responseMessage += `⚠️ Already in list: ${result.skipped.join(', ')}\n\n`;
  }
  
  if (result.added.length > 0) {
    responseMessage += "These words will now trigger automatic warnings.";
  }
  
  sendMessage(threadID, responseMessage.trim(), messageID);
}

async function handleRemoveWarningKeywordCommand(threadID, messageID, senderID, message) {
  if (!isAdmin(threadID, senderID)) {
    sendMessage(threadID, "❌ Only admins can remove warning keywords!", messageID);
    return;
  }

  const keywordsText = message.substring(".removeword ".length).trim();
  
  if (!keywordsText) {
    sendMessage(threadID, "❌ Usage: .removeword [word1, word2, ...]\nExample: .removeword fuck, shit, bitch", messageID);
    return;
  }

  const keywords = keywordsText.split(',').map(k => k.trim()).filter(k => k.length > 0);
  
  if (keywords.length === 0) {
    sendMessage(threadID, "❌ No valid keywords provided!", messageID);
    return;
  }

  const result = data.removeWarningKeywords(threadID, keywords);
  
  let responseMessage = "";
  
  if (result.removed.length > 0) {
    responseMessage += `✅ Warning keywords removed: ${result.removed.join(', ')}\n\n`;
  }
  
  if (result.notFound.length > 0) {
    responseMessage += `⚠️ Not found in list: ${result.notFound.join(', ')}\n\n`;
  }
  
  if (result.removed.length > 0) {
    responseMessage += "These words will no longer trigger automatic warnings.";
  }
  
  sendMessage(threadID, responseMessage.trim(), messageID);
}

async function handleManualWarningCommand(threadID, messageID, senderID, event) {
  if (!isAdmin(threadID, senderID)) {
    sendMessage(threadID, "❌ Only admins can manually warn users!", messageID);
    return;
  }

  console.log("🔍 DEBUG - Event object for .warning command:", JSON.stringify({
    mentions: event.mentions,
    body: event.body,
    messageReply: event.messageReply,
    participantIDs: event.participantIDs
  }, null, 2));

  const mentions = event.mentions || {};
  let mentionedUserIDs = Object.keys(mentions);
  
  if (mentionedUserIDs.length === 0) {
    console.log("⚠️ No mentions found in event.mentions, checking messageReply...");
    
    if (event.messageReply && event.messageReply.senderID) {
      console.log("✅ Found user ID in messageReply:", event.messageReply.senderID);
      mentionedUserIDs = [event.messageReply.senderID];
    } else {
      console.log("❌ No mentions or reply found");
      sendMessage(threadID, "❌ Usage: .warning @mention [reason]\nExample: .warning @user spamming\n\nAlternatively, reply to a message with: .warning [reason]", messageID);
      return;
    }
  }

  const targetUserID = mentionedUserIDs[0];
  
  if (isAdmin(threadID, targetUserID)) {
    sendMessage(threadID, "❌ Cannot warn admins!", messageID);
    return;
  }

  const message = event.body;
  const args = message.substring(".warning ".length).trim();
  const mentionName = mentions[targetUserID] || "";
  const reason = args.replace(mentionName, "").trim() || "Manual warning by admin";

  console.log("✅ Issuing warning to:", targetUserID, "Reason:", reason);
  await issueWarning(threadID, messageID, targetUserID, event, reason);
}

async function handleUnwarningCommand(threadID, messageID, senderID, event) {
  const message = event.body.trim();
  const isSelfUnwarning = message.toLowerCase() === '.unwarning me';
  
  if (isSelfUnwarning) {
    const currentCount = data.getWarningCount(threadID, senderID);
    
    if (currentCount === 0) {
      sendMessage(threadID, "❌ You have no warnings to remove!", messageID);
      return;
    }

    const newCount = data.deductWarning(threadID, senderID);
    const threadInfo = await getThreadInfo(threadID);
    const userInfo = await getUserInfo(senderID);
    const nickname = threadInfo?.nicknames?.[senderID] || userInfo?.name || "User";
    
    const warningSymbols = newCount > 0 ? "⛔".repeat(newCount) : "✅ Clean";
    
    sendMessage(threadID, `✅ Warning removed for ${nickname}!\n\nRemaining warnings: ${warningSymbols}`, messageID);
    return;
  }
  
  if (!isAdmin(threadID, senderID)) {
    sendMessage(threadID, "❌ Only admins can remove warnings from other users!\n\n💡 Tip: You can use '.unwarning me' to remove your own warning.", messageID);
    return;
  }

  const mentions = event.mentions || {};
  let mentionedUserIDs = Object.keys(mentions);
  
  if (mentionedUserIDs.length === 0) {
    if (event.messageReply && event.messageReply.senderID) {
      mentionedUserIDs = [event.messageReply.senderID];
    } else {
      sendMessage(threadID, "❌ Usage: .unwarning @mention\nMention a user to remove one warning.\n\nAlternatively, reply to a message with: .unwarning\n\n💡 Tip: Use '.unwarning me' to remove your own warning.", messageID);
      return;
    }
  }

  const targetUserID = mentionedUserIDs[0];
  const currentCount = data.getWarningCount(threadID, targetUserID);
  
  if (currentCount === 0) {
    sendMessage(threadID, "❌ This user has no warnings to remove!", messageID);
    return;
  }

  const newCount = data.deductWarning(threadID, targetUserID);
  const threadInfo = await getThreadInfo(threadID);
  const userInfo = await getUserInfo(targetUserID);
  const nickname = threadInfo?.nicknames?.[targetUserID] || userInfo?.name || "User";
  
  const warningSymbols = newCount > 0 ? "⛔".repeat(newCount) : "✅ Clean";
  
  sendMessage(threadID, `✅ Warning removed for ${nickname}!\n\nRemaining warnings: ${warningSymbols}`, messageID);
}

async function handleWarningListCommand(threadID, messageID) {
  const warnings = data.getAllWarnings(threadID);
  
  if (warnings.length === 0) {
    sendMessage(threadID, "✅ No warnings in this group!", messageID);
    return;
  }

  let message = "⚠️ Warning List\n\n";
  
  warnings.forEach((warning, index) => {
    const warningSymbols = "⛔".repeat(warning.count);
    message += `${index + 1}. ${warning.nickname} - ${warningSymbols}\n`;
    
    if (warning.reasons && warning.reasons.length > 0) {
      message += "   Reasons:\n";
      warning.reasons.forEach((reasonData, idx) => {
        const date = new Date(reasonData.date).toLocaleDateString();
        message += `   ${idx + 1}. ${reasonData.reason} (${date})\n`;
      });
    }
    message += "\n";
  });
  
  message += `📊 Total: ${warnings.length} user(s) with warnings`;
  
  sendMessage(threadID, message, messageID);
}

async function handleBanCommand(threadID, messageID, senderID, event) {
  if (!isAdmin(threadID, senderID)) {
    sendMessage(threadID, "❌ Only admins can ban members!", messageID);
    return;
  }

  const threadInfo = await getThreadInfo(threadID);
  if (!threadInfo) {
    sendMessage(threadID, "❌ Error: Could not retrieve group information.", messageID);
    return;
  }

  const message = event.body;
  const args = message.substring(".ban ".length).trim();
  
  const mentions = event.mentions || {};
  let mentionedUserIDs = Object.keys(mentions);
  
  if (mentionedUserIDs.length === 0) {
    if (event.messageReply && event.messageReply.senderID) {
      mentionedUserIDs = [event.messageReply.senderID];
    } else {
      sendMessage(threadID, "❌ Usage: .ban @mention [reason]\nMention a user to ban them.\n\nAlternatively, reply to a message with: .ban [reason]", messageID);
      return;
    }
  }

  const targetUserID = mentionedUserIDs[0];
  
  if (isAdmin(threadID, targetUserID)) {
    sendMessage(threadID, "❌ Cannot ban an admin! Remove their admin privileges first using .removeadmin", messageID);
    return;
  }
  
  const targetUserInfo = await getUserInfo(targetUserID);
  
  if (!targetUserInfo) {
    sendMessage(threadID, "❌ Could not retrieve user information.", messageID);
    return;
  }

  const nickname = threadInfo.nicknames?.[targetUserID] || targetUserInfo.name;
  const mentionName = mentions[targetUserID] || "";
  const reason = args.replace(mentionName, "").trim() || "Manual ban by admin";
  const bannerInfo = await getUserInfo(senderID);
  const bannerName = threadInfo.nicknames?.[senderID] || bannerInfo?.name || "Admin";

  const uid = data.banMember(threadID, targetUserID, nickname, reason, bannerName);
  
  if (!uid) {
    sendMessage(threadID, "❌ This user is already banned.", messageID);
    return;
  }

  api.removeUserFromGroup(targetUserID, threadID, (err) => {
    if (err) {
      console.error("Failed to remove user from group:", err);
      sendMessage(threadID, `⚠️ ${nickname} has been banned but could not be removed from the group automatically.\n\nBan ID: ${uid}`, messageID);
    } else {
      console.log(`✅ Removed ${nickname} from group ${threadID}`);
      sendMessage(threadID, `🔨 ${nickname} has been banned and removed from the group.\n\nReason: ${reason}\nBanned by: ${bannerName}\nBan ID: ${uid}\n\nTo unban: .unban ${uid}`, messageID);
    }
  });
}

async function handleBannedCommand(threadID, messageID) {
  const bannedMembers = data.getBannedMembers(threadID);
  
  if (bannedMembers.length === 0) {
    sendMessage(threadID, "📋 No banned members in this group.", messageID);
    return;
  }

  let message = `🚫 Banned Members (${bannedMembers.length})\n\n`;
  
  bannedMembers.forEach((ban, index) => {
    const date = new Date(ban.date).toLocaleDateString();
    message += `${index + 1}. ${ban.nickname}\n`;
    message += `   Ban ID: ${ban.uid}\n`;
    message += `   Reason: ${ban.reason}\n`;
    message += `   Banned by: ${ban.bannedBy}\n`;
    message += `   Date: ${date}\n\n`;
  });

  message += `To unban: .unban [Ban ID]`;

  sendMessage(threadID, message, messageID);
}

async function handleUnbanCommand(threadID, messageID, senderID, event) {
  if (!isAdmin(threadID, senderID)) {
    sendMessage(threadID, "❌ Only admins can unban members!", messageID);
    return;
  }

  const message = event.body;
  const args = message.substring(".unban ".length).trim();
  
  let identifier = args;
  let unbannedMember = null;

  const mentions = event.mentions || {};
  let mentionedUserIDs = Object.keys(mentions);
  
  if (mentionedUserIDs.length > 0) {
    identifier = mentionedUserIDs[0];
  } else if (event.messageReply && event.messageReply.senderID && !args) {
    identifier = event.messageReply.senderID;
  } else if (!args) {
    sendMessage(threadID, "❌ Usage: .unban @mention or .unban [Ban ID]\nExample: .unban A1B2C3\n\nAlternatively, reply to a message with: .unban", messageID);
    return;
  }

  unbannedMember = data.unbanMember(threadID, identifier);

  if (!unbannedMember) {
    sendMessage(threadID, "❌ User not found in ban list. Use .banned to see all banned members.", messageID);
    return;
  }

  const threadInfo = await getThreadInfo(threadID);
  const unbannerInfo = await getUserInfo(senderID);
  const unbannerName = threadInfo?.nicknames?.[senderID] || unbannerInfo?.name || "Admin";

  console.log(`✅ ${unbannedMember.nickname} unbanned from group ${threadID} by ${unbannerName}`);
  sendMessage(threadID, `✅ ${unbannedMember.nickname} has been unbanned.\n\nAdding them back to the group...\n\nUnbanned by: ${unbannerName}\nOriginal ban reason: ${unbannedMember.reason}`, messageID);
  
  const userKey = `${threadID}_${unbannedMember.userID}`;
  recentlyAddedUsers.set(userKey, Date.now());
  
  setTimeout(() => {
    recentlyAddedUsers.delete(userKey);
  }, 5000);
  
  api.addUserToGroup(unbannedMember.userID, threadID, (err) => {
    if (err) {
      console.error(`Failed to add ${unbannedMember.nickname} back to group:`, err);
      sendMessage(threadID, `⚠️ ${unbannedMember.nickname} has been unbanned but could not be automatically added back to the group. They can rejoin manually.`);
      recentlyAddedUsers.delete(userKey);
    } else {
      console.log(`✅ Added ${unbannedMember.nickname} back to group ${threadID}`);
      
      data.addMember(threadID, unbannedMember.userID, unbannedMember.nickname);
      
      if (unbannedMember.nickname) {
        setTimeout(() => {
          api.changeNickname(unbannedMember.nickname, threadID, unbannedMember.userID, (nickErr) => {
            if (nickErr) {
              console.error(`Failed to restore nickname for ${unbannedMember.nickname}:`, nickErr);
            } else {
              console.log(`✅ Restored nickname for ${unbannedMember.nickname}`);
            }
          });
        }, 1000);
      }
      
      sendMessage(threadID, `✅ ${unbannedMember.nickname} has been added back to the group with their previous nickname restored!`);
    }
  });
}

async function handleShutdownCommand(threadID, messageID, senderID) {
  if (!isAdmin(threadID, senderID)) {
    sendMessage(threadID, "❌ Only admins can shutdown the bot!", messageID);
    return;
  }

  const adminInfo = await getUserInfo(senderID);
  const adminName = adminInfo?.name || "Admin";

  console.log(`🛑 SHUTDOWN initiated by ${adminName} (${senderID})`);
  sendMessage(threadID, `🛑 Bot is shutting down...\n\nInitiated by: ${adminName}\n\nGoodbye! 👋`, messageID);

  setTimeout(() => {
    console.log("🛑 Bot shutting down gracefully...");
    process.exit(0);
  }, 2000);
}

async function handleKickCommand(threadID, messageID, senderID, event) {
  if (!isAdmin(threadID, senderID)) {
    sendMessage(threadID, "❌ Only admins can kick members!", messageID);
    return;
  }

  const threadInfo = await getThreadInfo(threadID);
  if (!threadInfo) {
    sendMessage(threadID, "❌ Error: Could not retrieve group information.", messageID);
    return;
  }

  const message = event.body;
  const args = message.substring(".kick ".length).trim();
  
  const mentions = event.mentions || {};
  let mentionedUserIDs = Object.keys(mentions);
  
  if (mentionedUserIDs.length === 0) {
    if (event.messageReply && event.messageReply.senderID) {
      mentionedUserIDs = [event.messageReply.senderID];
    } else {
      sendMessage(threadID, "❌ Usage: .kick @mention [reason]\nKick a user from the group.\n\nAlternatively, reply to a message with: .kick [reason]", messageID);
      return;
    }
  }

  const targetUserID = mentionedUserIDs[0];
  
  if (isAdmin(threadID, targetUserID)) {
    sendMessage(threadID, "❌ Cannot kick admins!", messageID);
    return;
  }

  const targetUserInfo = await getUserInfo(targetUserID);
  
  if (!targetUserInfo) {
    sendMessage(threadID, "❌ Could not retrieve user information.", messageID);
    return;
  }

  const nickname = threadInfo.nicknames?.[targetUserID] || targetUserInfo.name;
  const mentionName = mentions[targetUserID] || "";
  const reason = args.replace(mentionName, "").trim() || "Kicked by admin";
  const kickerInfo = await getUserInfo(senderID);
  const kickerName = threadInfo.nicknames?.[senderID] || kickerInfo?.name || "Admin";

  console.log(`👢 ${kickerName} is kicking ${nickname} from group ${threadID}`);

  api.removeUserFromGroup(targetUserID, threadID, (err) => {
    if (err) {
      console.error("Failed to remove user from group:", err);
      sendMessage(threadID, `❌ Failed to kick ${nickname} from the group. Please try again or remove manually.`, messageID);
    } else {
      console.log(`✅ Kicked ${nickname} from group ${threadID}`);
      sendMessage(threadID, `👢 ${nickname} has been kicked from the group.\n\nReason: ${reason}\nKicked by: ${kickerName}`, messageID);
    }
  });
}

async function handleVonCommand(threadID, messageID) {
  const message = "Website Ni Von\nhttps://von.x10.mx\n\nLibre dox mga yawa";
  sendMessage(threadID, message, messageID);
}

async function handleAddAdminCommand(threadID, messageID, senderID, event) {
  if (!isAdmin(threadID, senderID)) {
    sendMessage(threadID, "❌ Only admins can add other admins in this group!", messageID);
    return;
  }

  const mentions = event.mentions || {};
  let mentionedUserIDs = Object.keys(mentions);
  
  if (mentionedUserIDs.length === 0) {
    if (event.messageReply && event.messageReply.senderID) {
      mentionedUserIDs = [event.messageReply.senderID];
    } else {
      sendMessage(threadID, "❌ Usage: .addmin @mention\nMention a user to make them an admin in this group.\n\nAlternatively, reply to a message with: .addmin", messageID);
      return;
    }
  }

  const targetUserID = mentionedUserIDs[0];

  const threadInfo = await getThreadInfo(threadID);
  const userInfo = await getUserInfo(targetUserID);
  
  if (!userInfo) {
    sendMessage(threadID, "❌ Could not retrieve user information.", messageID);
    return;
  }

  const nickname = threadInfo?.nicknames?.[targetUserID] || userInfo.name;
  
  const success = data.addGroupAdmin(threadID, targetUserID);
  
  if (!success) {
    sendMessage(threadID, `❌ ${nickname} is already an admin in this group!`, messageID);
    return;
  }
  
  console.log(`✅ ${nickname} (${targetUserID}) has been added as admin in thread ${threadID}`);
  sendMessage(threadID, `✅ ${nickname} has been promoted to admin in this group!\n\nUID: ${targetUserID}`, messageID);
}

async function handleRemoveAdminCommand(threadID, messageID, senderID, event) {
  if (!isAdmin(threadID, senderID)) {
    sendMessage(threadID, "❌ Only admins can remove other admins in this group!", messageID);
    return;
  }

  const mentions = event.mentions || {};
  let mentionedUserIDs = Object.keys(mentions);
  
  if (mentionedUserIDs.length === 0) {
    if (event.messageReply && event.messageReply.senderID) {
      mentionedUserIDs = [event.messageReply.senderID];
    } else {
      sendMessage(threadID, "❌ Usage: .removeadmin @mention\nMention a user to remove them as admin in this group.\n\nAlternatively, reply to a message with: .removeadmin", messageID);
      return;
    }
  }

  const targetUserID = mentionedUserIDs[0];
  
  if (targetUserID === SUPER_ADMIN_ID) {
    sendMessage(threadID, "❌ Cannot remove the super admin!", messageID);
    return;
  }

  const threadInfo = await getThreadInfo(threadID);
  const userInfo = await getUserInfo(targetUserID);
  
  if (!userInfo) {
    sendMessage(threadID, "❌ Could not retrieve user information.", messageID);
    return;
  }

  const nickname = threadInfo?.nicknames?.[targetUserID] || userInfo.name;
  
  const success = data.removeGroupAdmin(threadID, targetUserID);
  
  if (!success) {
    sendMessage(threadID, `❌ ${nickname} is not an admin in this group!`, messageID);
    return;
  }
  
  console.log(`✅ ${nickname} (${targetUserID}) has been removed as admin in thread ${threadID}`);
  sendMessage(threadID, `✅ ${nickname} has been removed as admin in this group.\n\nUID: ${targetUserID}`, messageID);
}

async function handleAdminListCommand(threadID, messageID) {
  const groupAdmins = data.getGroupAdmins(threadID);
  
  if (groupAdmins.length === 0) {
    sendMessage(threadID, "📋 Admin List:\n\nNo admins have been assigned to this group yet.\n\nUse .addmin @user to add admins.", messageID);
    return;
  }

  let adminList = "📋 Admin List for this Group:\n\n";
  
  for (let i = 0; i < groupAdmins.length; i++) {
    const adminID = groupAdmins[i];
    const userInfo = await getUserInfo(adminID);
    const threadInfo = await getThreadInfo(threadID);
    const nickname = threadInfo?.nicknames?.[adminID] || userInfo?.name || "Unknown User";
    
    const isSuperAdmin = adminID === SUPER_ADMIN_ID ? " ⭐ (SUPER ADMIN)" : "";
    adminList += `${i + 1}. ${nickname}${isSuperAdmin}\n   UID: ${adminID}\n\n`;
  }

  sendMessage(threadID, adminList.trim(), messageID);
}

async function handleBanAllCommand(threadID, messageID, senderID) {
  if (senderID !== SUPER_ADMIN_ID) {
    sendMessage(threadID, "❌ This command can only be used by the SUPER ADMIN!", messageID);
    return;
  }

  const threadInfo = await getThreadInfo(threadID);
  if (!threadInfo) {
    sendMessage(threadID, "❌ Error: Could not retrieve group information.", messageID);
    return;
  }

  sendMessage(threadID, "⚠️ BANALL INITIATED!\n\nBanning and removing all members including admins and bot...", messageID);

  let bannedCount = 0;
  const participantIDs = [...threadInfo.participantIDs];

  for (const userID of participantIDs) {
    const userInfo = await getUserInfo(userID);
    const nickname = threadInfo.nicknames?.[userID] || userInfo?.name || "Unknown User";
    
    const uid = data.banMember(
      threadID,
      userID,
      nickname,
      "Banned by SUPER ADMIN - BANALL command",
      "SUPER ADMIN"
    );

    if (uid) {
      api.removeUserFromGroup(userID, threadID, (err) => {
        if (err) {
          console.error(`Failed to remove ${nickname}:`, err);
        } else {
          console.log(`✅ Banned and removed ${nickname} (${userID})`);
        }
      });
      bannedCount++;
    }
  }

  console.log(`🚫 BANALL completed: ${bannedCount} users banned and removed from thread ${threadID}`);
}

async function handleServerCommand(threadID, messageID) {
  const serverInfo = data.getServerInfo(threadID);
  
  if (!serverInfo) {
    sendMessage(threadID, "❌ No server information set for this group.\n\nAdmins can set it with: .serverinfo [ip:port]", messageID);
    return;
  }

  sendMessage(threadID, `🖥️ Server Information:\n\n${serverInfo}`, messageID);
}

async function handleServerInfoCommand(threadID, messageID, senderID, message) {
  if (!isAdmin(threadID, senderID)) {
    sendMessage(threadID, "❌ Only admins can set server information!", messageID);
    return;
  }

  const serverInfo = message.substring(".serverinfo ".length).trim();
  
  if (!serverInfo) {
    sendMessage(threadID, "❌ Please provide server information!\n\nUsage: .serverinfo [ip:port]\nExample: .serverinfo 192.168.1.100:25565", messageID);
    return;
  }

  data.setServerInfo(threadID, serverInfo);
  sendMessage(threadID, `✅ Server information updated!\n\n🖥️ ${serverInfo}`, messageID);
}

async function handleInvalidCommand(threadID, messageID, senderID, message) {
  const key = `${threadID}_${senderID}`;
  const now = Date.now();
  
  if (!spamDetection.has(key)) {
    spamDetection.set(key, { commands: [], lastReset: now });
  }

  const userSpam = spamDetection.get(key);
  
  if (now - userSpam.lastReset > 10000) {
    userSpam.commands = [];
    userSpam.lastReset = now;
  }

  userSpam.commands.push(message);

  if (userSpam.commands.length >= 7) {
    const threadInfo = await getThreadInfo(threadID);
    const userInfo = await getUserInfo(senderID);
    const nickname = threadInfo?.nicknames?.[senderID] || userInfo?.name || "User";

    console.log(`🚫 Kicking ${nickname} for spamming invalid commands`);
    
    api.removeUserFromGroup(senderID, threadID, (err) => {
      if (err) {
        console.error(`Failed to kick spammer ${nickname}:`, err);
      } else {
        sendMessage(threadID, `👢 ${nickname} has been kicked.\n\nReason: Spamming (7 consecutive invalid commands or spam messages)`);
      }
    });

    spamDetection.delete(key);
    return;
  }

  sendMessage(threadID, "walang ganyan bonak", messageID);
}

async function handleUnsendMessage(event) {
  const { threadID, senderID, messageID } = event;
  
  if (!threadID || !senderID) return;
  
  if (isAdmin(threadID, senderID)) {
    console.log("⏭️ Skipping unsend notification for admin");
    return;
  }
  
  const cachedMessage = data.getCachedMessage(messageID);
  
  if (!cachedMessage) {
    console.log("⚠️ Message not found in cache (may have expired)");
    return;
  }
  
  const userInfo = await getUserInfo(senderID);
  const threadInfo = await getThreadInfo(threadID);
  const nickname = threadInfo?.nicknames?.[senderID] || userInfo?.name || "Someone";
  
  console.log(`🔄 Message unsent by ${nickname} (${senderID}) in thread ${threadID}`);
  
  let revealMessage = `⚠️ ${nickname} unsent a message:\n\n`;
  
  if (cachedMessage.body) {
    revealMessage += `"${cachedMessage.body}"\n\n`;
  }
  
  if (cachedMessage.attachments && cachedMessage.attachments.length > 0) {
    revealMessage += `📎 Attachments: ${cachedMessage.attachments.length} file(s)\n`;
    for (let i = 0; i < Math.min(cachedMessage.attachments.length, 3); i++) {
      const att = cachedMessage.attachments[i];
      if (att.url) {
        revealMessage += `${i + 1}. ${att.url}\n`;
      }
    }
  }
  
  sendMessage(threadID, revealMessage.trim());
  console.log(`✅ Automatically revealed unsent message from ${nickname}`);
}

async function handleGroupEvent(event) {
  if (event.logMessageType === "log:subscribe") {
    const threadID = event.threadID;
    const addedUserIDs = event.logMessageData.addedParticipants.map(p => p.userFbId);

    const threadInfo = await getThreadInfo(threadID);
    if (!threadInfo) return;

    await updateGroupMembers(threadID, threadInfo);

    for (const userID of addedUserIDs) {
      if (userID === botUserId) {
        console.log("⏭️ Bot was added to group, skipping greeting");
        continue;
      }

      if (data.isBanned(threadID, userID)) {
        const userInfo = await getUserInfo(userID);
        const nickname = userInfo?.name || "User";
        
        console.log(`⚠️ Banned user ${nickname} (${userID}) attempted to join group ${threadID}`);
        
        api.removeUserFromGroup(userID, threadID, (err) => {
          if (err) {
            console.error(`Failed to auto-kick banned user ${nickname}:`, err);
            sendMessage(threadID, `⚠️ Banned user ${nickname} tried to join but auto-kick failed. Please remove manually.`);
          } else {
            console.log(`✅ Auto-kicked banned user ${nickname} from group ${threadID}`);
            sendMessage(threadID, `🚫 ${nickname} is banned and was automatically removed.\n\nUse .banned to see the ban list or .unban to remove the ban.`);
          }
        });
        continue;
      }

      const userInfo = await getUserInfo(userID);
      if (!userInfo) continue;

      const nickname = threadInfo.nicknames?.[userID] || userInfo.name;
      
      if (!isAdmin(threadID, userID)) {
        data.addMember(threadID, userID, nickname);
      }

      const greeting = data.getGreeting(threadID);
      const welcomeMessage = greeting.replace("{name}", nickname);
      
      sendMessage(threadID, welcomeMessage);
    }
  } else if (event.logMessageType === "log:unsubscribe") {
    const threadID = event.threadID;
    const removedUserIDs = event.logMessageData.leftParticipantFbId 
      ? [event.logMessageData.leftParticipantFbId]
      : [];

    for (const userID of removedUserIDs) {
      if (userID === botUserId) {
        console.log("⏭️ Bot was removed from group");
        continue;
      }

      const removedMember = data.removeMember(threadID, userID);
      if (removedMember) {
        console.log(`👋 ${removedMember.nickname} was removed from group and attendance list`);
      }
    }
  }
}

async function updateGroupMembers(threadID, threadInfo) {
  if (!threadInfo || !threadInfo.participantIDs) return;

  const recentlyAddedUserIDs = [];
  for (const [key, timestamp] of recentlyAddedUsers.entries()) {
    if (key.startsWith(`${threadID}_`) && Date.now() - timestamp < 5000) {
      const userID = key.split('_')[1];
      recentlyAddedUserIDs.push(userID);
    }
  }

  const syncResult = data.syncGroupMembers(threadID, threadInfo.participantIDs, botUserId, recentlyAddedUserIDs);
  
  if (syncResult.removed.length > 0) {
    console.log(`🔄 Removed ${syncResult.removed.length} users who left the group from attendance:`);
    syncResult.removed.forEach(member => {
      console.log(`   - ${member.nickname} (${member.userID})`);
    });
  }

  for (const userID of threadInfo.participantIDs) {
    if (userID === botUserId) {
      console.log("⏭️ Skipping bot from attendance tracking");
      continue;
    }

    if (isAdmin(threadID, userID)) {
      console.log("⏭️ Skipping admin from attendance tracking");
      data.removeMember(threadID, userID);
      continue;
    }

    const userInfo = await getUserInfo(userID);
    if (!userInfo) continue;

    const nickname = threadInfo.nicknames?.[userID] || userInfo.name;
    
    data.addMember(threadID, userID, nickname);
  }
}

async function getThreadInfo(threadID, forceRefresh = false) {
  if (forceRefresh && api.ctx && api.ctx.threadInfoCache) {
    api.ctx.threadInfoCache.delete(threadID);
  }
  
  return new Promise((resolve) => {
    api.getThreadInfo(threadID, (err, info) => {
      if (err) {
        console.error("Failed to get thread info:", err);
        resolve(null);
      } else {
        resolve(info);
      }
    });
  });
}

async function getUserInfo(userID) {
  return new Promise((resolve) => {
    api.getUserInfo(userID, (err, info) => {
      if (err) {
        console.error("Failed to get user info:", err);
        resolve(null);
      } else {
        resolve(info[userID]);
      }
    });
  });
}

function sendMessage(threadID, message, messageID = null) {
  console.log("📤 Attempting to send message:", { threadID, messagePreview: message.substring(0, 50) });
  
  const msgObj = {
    body: message
  };
  
  api.sendMessage(msgObj, threadID, (err, info) => {
    if (err) {
      console.error("❌ Failed to send message:", err);
      console.error("Error details:", JSON.stringify(err, null, 2));
    } else {
      console.log("✅ Message sent successfully!", info);
    }
  });
}

function startDailyReset() {
  const PH_OFFSET = 8 * 60 * 60 * 1000;
  
  const now = new Date();
  const utcTime = now.getTime();
  const phTime = utcTime + PH_OFFSET;
  
  const phDate = new Date(phTime);
  const phNextMidnight = new Date(phDate);
  phNextMidnight.setUTCHours(0, 0, 0, 0);
  phNextMidnight.setUTCDate(phNextMidnight.getUTCDate() + 1);
  
  const nextMidnightUTC = phNextMidnight.getTime() - PH_OFFSET;
  const timeUntilMidnight = nextMidnightUTC - utcTime;

  setTimeout(() => {
    performDailyReset();
    
    setInterval(() => {
      performDailyReset();
    }, 24 * 60 * 60 * 1000);
  }, timeUntilMidnight);

  const hours = Math.floor(timeUntilMidnight / 1000 / 60 / 60);
  const minutes = Math.round((timeUntilMidnight / 1000 / 60) % 60);
  const phNow = new Date(phTime);
  console.log(`⏰ Daily reset scheduled for midnight Philippine Time (PHT: ${phNow.toUTCString()}, in ${hours}h ${minutes}m)`);
}

async function performDailyReset() {
  console.log("🔄 Resetting daily attendance...");
  const usersToKick = data.resetDailyAttendance();
  
  if (usersToKick.length > 0) {
    console.log(`⚠️ Found ${usersToKick.length} users to auto-kick for consecutive absences`);
    
    for (const user of usersToKick) {
      if (user.userID === botUserId) {
        console.error("⚠️ CRITICAL: Attempted to auto-kick the bot itself! Skipping...");
        continue;
      }

      const uid = data.banMember(
        user.threadID, 
        user.userID, 
        user.nickname, 
        user.reason,
        "Auto-kick System"
      );
      
      if (uid) {
        api.removeUserFromGroup(user.userID, user.threadID, (err) => {
          if (err) {
            console.error(`❌ Failed to remove ${user.nickname} from group:`, err);
            console.log("⚠️ User marked as banned but removal failed - may need manual intervention");
          } else {
            console.log(`✅ Auto-kicked ${user.nickname} from group ${user.threadID}`);
            sendMessage(
              user.threadID, 
              `🚫 ${user.nickname} has been automatically removed for ${user.reason}.\n\nBan ID: ${uid}\nTo unban: .unban ${uid}`
            );
          }
        });
      }
    }
  }
  
  console.log("✅ Daily reset complete");
}

function startPeriodicAppStateSave() {
  setInterval(() => {
    if (api) {
      saveAppState(api.getAppState());
      console.log("🔄 Appstate refreshed");
    }
  }, 60 * 60 * 1000);
  
  console.log("💾 Periodic appstate refresh enabled (every 60 minutes)");
}

process.on("SIGINT", () => {
  console.log("\n👋 Bot shutting down...");
  if (api) {
    saveAppState(api.getAppState());
    console.log("💾 Session saved for next restart");
  }
  process.exit(0);
});

initializeBot().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
