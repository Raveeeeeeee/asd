const fs = require("fs");
const path = require("path");

class DataManager {
  constructor() {
    this.dataDir = path.join(__dirname, "data");
    this.greetingsFile = path.join(this.dataDir, "greetings.json");
    this.attendanceFile = path.join(this.dataDir, "attendance.json");
    this.bannedFile = path.join(this.dataDir, "banned.json");
    this.warningsFile = path.join(this.dataDir, "warnings.json");
    this.warningKeywordsFile = path.join(this.dataDir, "warningKeywords.json");
    this.excludedFile = path.join(this.dataDir, "excluded.json");
    this.adminsFile = path.join(this.dataDir, "admins.json");
    this.serverInfoFile = path.join(this.dataDir, "serverInfo.json");
    
    this.ensureDataDir();
    this.greetings = this.loadJSON(this.greetingsFile, {});
    this.attendance = this.loadJSON(this.attendanceFile, {});
    this.banned = this.loadJSON(this.bannedFile, {});
    this.warnings = this.loadJSON(this.warningsFile, {});
    this.warningKeywords = this.loadJSON(this.warningKeywordsFile, {
      global: []
    });
    this.excluded = this.loadJSON(this.excludedFile, {});
    this.admins = this.loadJSON(this.adminsFile, {});
    this.serverInfo = this.loadJSON(this.serverInfoFile, {});
    
    this.messageCache = new Map();
  }

  ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  loadJSON(filePath, defaultValue) {
    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
        return data;
      }
    } catch (error) {
      console.error(`Failed to load ${filePath}:`, error.message);
    }
    return defaultValue;
  }

  saveJSON(filePath, data) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`Failed to save ${filePath}:`, error.message);
    }
  }

  getGreeting(threadID) {
    return this.greetings[threadID] || "Welcome {name} to the group! 👋";
  }

  setGreeting(threadID, greeting) {
    this.greetings[threadID] = greeting;
    this.saveJSON(this.greetingsFile, this.greetings);
  }

  getAttendance(threadID, includeExcluded = false) {
    const today = this.getTodayDate();
    
    if (!this.attendance[threadID]) {
      this.attendance[threadID] = {
        date: today,
        members: []
      };
    }

    if (this.attendance[threadID].date !== today) {
      this.attendance[threadID].date = today;
      this.attendance[threadID].members.forEach(member => {
        member.present = false;
      });
      this.saveJSON(this.attendanceFile, this.attendance);
    }

    if (includeExcluded) {
      return this.attendance[threadID];
    }

    const excludedUsers = this.getExcludedMembers(threadID);
    const filteredAttendance = {
      ...this.attendance[threadID],
      members: this.attendance[threadID].members.filter(m => !excludedUsers.includes(m.userID))
    };

    return filteredAttendance;
  }

  addMember(threadID, userID, nickname) {
    const attendance = this.getAttendance(threadID, true);
    
    const existingMember = attendance.members.find(m => m.userID === userID);
    
    if (existingMember) {
      if (existingMember.nickname !== nickname) {
        existingMember.nickname = nickname;
        this.saveJSON(this.attendanceFile, this.attendance);
      }
    } else {
      attendance.members.push({
        userID,
        nickname,
        present: false,
        consecutiveAbsences: 0
      });
      this.saveJSON(this.attendanceFile, this.attendance);
    }
  }

  removeMember(threadID, userID) {
    const attendance = this.getAttendance(threadID);
    const memberIndex = attendance.members.findIndex(m => m.userID === userID);
    
    if (memberIndex !== -1) {
      const removedMember = attendance.members[memberIndex];
      attendance.members.splice(memberIndex, 1);
      this.saveJSON(this.attendanceFile, this.attendance);
      console.log(`✅ Removed ${removedMember.nickname} from attendance list in thread ${threadID}`);
      return removedMember;
    }
    return null;
  }

  markPresent(threadID, userID, nickname) {
    const attendance = this.getAttendance(threadID, true);
    
    let member = attendance.members.find(m => m.userID === userID);
    
    if (!member) {
      member = {
        userID,
        nickname,
        present: false,
        consecutiveAbsences: 0
      };
      attendance.members.push(member);
    }

    if (member.nickname !== nickname) {
      member.nickname = nickname;
    }

    if (member.present) {
      return true;
    }

    member.present = true;
    member.consecutiveAbsences = 0;
    this.saveJSON(this.attendanceFile, this.attendance);
    return false;
  }

  getMissedAttendanceList(threadID) {
    const attendance = this.getAttendance(threadID);
    const excludedUsers = this.getExcludedMembers(threadID);
    
    const missedList = attendance.members
      .filter(m => !m.present && !excludedUsers.includes(m.userID))
      .map(m => ({
        userID: m.userID,
        nickname: m.nickname,
        consecutiveAbsences: m.consecutiveAbsences || 0
      }))
      .sort((a, b) => b.consecutiveAbsences - a.consecutiveAbsences);
    
    return missedList;
  }

  manualResetAttendance(threadID) {
    const today = this.getTodayDate();
    
    if (!this.attendance[threadID]) {
      return false;
    }

    this.attendance[threadID].date = today;
    this.attendance[threadID].members.forEach(member => {
      member.present = false;
    });
    
    this.saveJSON(this.attendanceFile, this.attendance);
    return true;
  }

  resetConsecutiveAbsences(threadID, userID = null) {
    if (!this.attendance[threadID]) {
      return false;
    }

    if (userID) {
      const member = this.attendance[threadID].members.find(m => m.userID === userID);
      if (!member) {
        return false;
      }
      member.consecutiveAbsences = 0;
    } else {
      this.attendance[threadID].members.forEach(member => {
        member.consecutiveAbsences = 0;
      });
    }
    
    this.saveJSON(this.attendanceFile, this.attendance);
    return true;
  }

  resetDailyAttendance() {
    const today = this.getTodayDate();
    const usersToKick = [];
    
    for (const threadID in this.attendance) {
      this.attendance[threadID].date = today;
      this.attendance[threadID].members.forEach(member => {
        if (!member.present) {
          member.consecutiveAbsences = (member.consecutiveAbsences || 0) + 1;
          
          if (member.consecutiveAbsences >= 3) {
            usersToKick.push({
              threadID,
              userID: member.userID,
              nickname: member.nickname,
              reason: `3 consecutive days absent (${member.consecutiveAbsences} days)`
            });
          }
        }
        member.present = false;
      });
    }
    
    this.saveJSON(this.attendanceFile, this.attendance);
    return usersToKick;
  }

  banMember(threadID, userID, nickname, reason, bannedBy) {
    if (!this.banned[threadID]) {
      this.banned[threadID] = [];
    }

    const existingBan = this.banned[threadID].find(b => b.userID === userID);
    if (existingBan) {
      return false;
    }

    const uid = this.generateUniqueUID(threadID);

    this.banned[threadID].push({
      uid,
      userID,
      nickname,
      reason,
      bannedBy,
      date: new Date().toISOString()
    });

    const attendance = this.getAttendance(threadID);
    const memberIndex = attendance.members.findIndex(m => m.userID === userID);
    if (memberIndex !== -1) {
      attendance.members.splice(memberIndex, 1);
    }

    this.saveJSON(this.bannedFile, this.banned);
    this.saveJSON(this.attendanceFile, this.attendance);
    return uid;
  }

  unbanMember(threadID, identifier) {
    if (!this.banned[threadID]) {
      return null;
    }

    let bannedMember = null;
    let banIndex = -1;

    if (identifier.length === 6) {
      banIndex = this.banned[threadID].findIndex(b => b.uid === identifier);
    } else {
      banIndex = this.banned[threadID].findIndex(b => b.userID === identifier);
    }

    if (banIndex === -1) {
      return null;
    }

    bannedMember = this.banned[threadID][banIndex];
    this.banned[threadID].splice(banIndex, 1);
    this.saveJSON(this.bannedFile, this.banned);
    
    return bannedMember;
  }

  saveAdminList(admins) {
    const adminFile = path.join(this.dataDir, "admins.json");
    this.saveJSON(adminFile, admins);
  }

  loadAdminList() {
    const adminFile = path.join(this.dataDir, "admins.json");
    return this.loadJSON(adminFile, []);
  }

  isBanned(threadID, userID) {
    if (!this.banned[threadID]) {
      return false;
    }
    return this.banned[threadID].some(b => b.userID === userID);
  }

  getBannedMembers(threadID) {
    return this.banned[threadID] || [];
  }

  generateUID() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let uid = '';
    for (let i = 0; i < 6; i++) {
      uid += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return uid;
  }

  generateUniqueUID(threadID) {
    let uid = this.generateUID();
    let attempts = 0;
    const maxAttempts = 100;

    if (!this.banned[threadID]) {
      return uid;
    }

    while (this.banned[threadID].some(b => b.uid === uid) && attempts < maxAttempts) {
      uid = this.generateUID();
      attempts++;
    }

    if (attempts >= maxAttempts) {
      uid = `${uid}${Date.now().toString().slice(-3)}`;
    }

    return uid;
  }

  getTodayDate() {
    const PH_OFFSET = 8 * 60 * 60 * 1000;
    const now = new Date();
    const phTime = new Date(now.getTime() + PH_OFFSET);
    return phTime.toLocaleDateString('en-US', { timeZone: 'UTC' });
  }

  addWarning(threadID, userID, nickname, reason) {
    if (!this.warnings[threadID]) {
      this.warnings[threadID] = {};
    }

    if (!this.warnings[threadID][userID]) {
      this.warnings[threadID][userID] = {
        nickname,
        count: 0,
        reasons: []
      };
    }

    this.warnings[threadID][userID].count++;
    this.warnings[threadID][userID].nickname = nickname;
    this.warnings[threadID][userID].reasons.push({
      reason,
      date: new Date().toISOString()
    });

    this.saveJSON(this.warningsFile, this.warnings);
    return this.warnings[threadID][userID].count;
  }

  getWarningCount(threadID, userID) {
    if (!this.warnings[threadID] || !this.warnings[threadID][userID]) {
      return 0;
    }
    return this.warnings[threadID][userID].count;
  }

  getAllWarnings(threadID) {
    if (!this.warnings[threadID]) {
      return [];
    }

    const warningList = [];
    for (const userID in this.warnings[threadID]) {
      const userData = this.warnings[threadID][userID];
      warningList.push({
        userID,
        nickname: userData.nickname,
        count: userData.count,
        reasons: userData.reasons
      });
    }

    warningList.sort((a, b) => b.count - a.count);
    return warningList;
  }

  clearWarnings(threadID, userID) {
    if (this.warnings[threadID] && this.warnings[threadID][userID]) {
      delete this.warnings[threadID][userID];
      this.saveJSON(this.warningsFile, this.warnings);
    }
  }

  deductWarning(threadID, userID) {
    if (!this.warnings[threadID] || !this.warnings[threadID][userID]) {
      return 0;
    }

    const userData = this.warnings[threadID][userID];
    
    if (userData.count > 0) {
      userData.count--;
      if (userData.reasons.length > 0) {
        userData.reasons.pop();
      }
      
      if (userData.count === 0) {
        delete this.warnings[threadID][userID];
      }
      
      this.saveJSON(this.warningsFile, this.warnings);
    }

    return userData.count;
  }

  getWarningKeywords(threadID) {
    const globalKeywords = this.warningKeywords.global || [];
    const threadKeywords = this.warningKeywords[threadID] || [];
    return [...globalKeywords, ...threadKeywords];
  }

  addWarningKeyword(threadID, keyword) {
    if (!this.warningKeywords[threadID]) {
      this.warningKeywords[threadID] = [];
    }

    const lowerKeyword = keyword.toLowerCase();
    
    if (this.warningKeywords.global.includes(lowerKeyword) || 
        this.warningKeywords[threadID].includes(lowerKeyword)) {
      return false;
    }

    this.warningKeywords[threadID].push(lowerKeyword);
    this.saveJSON(this.warningKeywordsFile, this.warningKeywords);
    return true;
  }

  addWarningKeywords(threadID, keywords) {
    const added = [];
    const skipped = [];
    
    for (const keyword of keywords) {
      const success = this.addWarningKeyword(threadID, keyword);
      if (success) {
        added.push(keyword);
      } else {
        skipped.push(keyword);
      }
    }
    
    return { added, skipped };
  }

  syncGroupMembers(threadID, currentMemberIDs, botUserId, recentlyAddedUserIDs = []) {
    if (!this.attendance[threadID]) {
      return { removed: [] };
    }

    const removed = [];
    const currentMembers = this.attendance[threadID].members.filter(member => {
      if (member.userID === botUserId) {
        removed.push(member);
        return false;
      }
      if (recentlyAddedUserIDs.includes(member.userID)) {
        return true;
      }
      if (!currentMemberIDs.includes(member.userID)) {
        removed.push(member);
        return false;
      }
      return true;
    });

    this.attendance[threadID].members = currentMembers;
    
    if (removed.length > 0) {
      this.saveJSON(this.attendanceFile, this.attendance);
    }

    return { removed };
  }

  getExcludedMembers(threadID) {
    return this.excluded[threadID] || [];
  }

  excludeMember(threadID, userID, nickname) {
    if (!this.excluded[threadID]) {
      this.excluded[threadID] = [];
    }

    const alreadyExcluded = this.excluded[threadID].some(m => m.userID === userID);
    if (alreadyExcluded) {
      return false;
    }

    this.excluded[threadID].push({
      userID,
      nickname,
      excludedDate: new Date().toISOString()
    });

    this.saveJSON(this.excludedFile, this.excluded);
    return true;
  }

  includeMember(threadID, userID) {
    if (!this.excluded[threadID]) {
      return null;
    }

    const memberIndex = this.excluded[threadID].findIndex(m => m.userID === userID);
    if (memberIndex === -1) {
      return null;
    }

    const member = this.excluded[threadID][memberIndex];
    this.excluded[threadID].splice(memberIndex, 1);

    if (this.excluded[threadID].length === 0) {
      delete this.excluded[threadID];
    }

    this.saveJSON(this.excludedFile, this.excluded);
    return member;
  }

  isExcluded(threadID, userID) {
    if (!this.excluded[threadID]) {
      return false;
    }
    return this.excluded[threadID].some(m => m.userID === userID);
  }

  cacheMessage(messageID, threadID, senderID, body, attachments = []) {
    const cacheData = {
      messageID,
      threadID,
      senderID,
      body: body || "",
      attachments,
      timestamp: Date.now()
    };
    
    this.messageCache.set(messageID, cacheData);
    
    setTimeout(() => {
      this.messageCache.delete(messageID);
    }, 60000);
  }

  getCachedMessage(messageID) {
    return this.messageCache.get(messageID);
  }

  getGroupAdmins(threadID) {
    if (!this.admins[threadID]) {
      return [];
    }
    return this.admins[threadID];
  }

  addGroupAdmin(threadID, userID) {
    if (!this.admins[threadID]) {
      this.admins[threadID] = [];
    }
    
    if (this.admins[threadID].includes(userID)) {
      return false;
    }
    
    this.admins[threadID].push(userID);
    this.saveJSON(this.adminsFile, this.admins);
    return true;
  }

  removeGroupAdmin(threadID, userID) {
    if (!this.admins[threadID]) {
      return false;
    }
    
    const index = this.admins[threadID].indexOf(userID);
    if (index === -1) {
      return false;
    }
    
    this.admins[threadID].splice(index, 1);
    
    if (this.admins[threadID].length === 0) {
      delete this.admins[threadID];
    }
    
    this.saveJSON(this.adminsFile, this.admins);
    return true;
  }

  isGroupAdmin(threadID, userID) {
    if (!this.admins[threadID]) {
      return false;
    }
    return this.admins[threadID].includes(userID);
  }

  removeWarningKeyword(threadID, keyword) {
    if (!this.warningKeywords[threadID]) {
      return false;
    }

    const lowerKeyword = keyword.toLowerCase();
    const index = this.warningKeywords[threadID].indexOf(lowerKeyword);
    
    if (index === -1) {
      return false;
    }

    this.warningKeywords[threadID].splice(index, 1);
    
    if (this.warningKeywords[threadID].length === 0) {
      delete this.warningKeywords[threadID];
    }
    
    this.saveJSON(this.warningKeywordsFile, this.warningKeywords);
    return true;
  }

  removeWarningKeywords(threadID, keywords) {
    const removed = [];
    const notFound = [];
    
    for (const keyword of keywords) {
      const success = this.removeWarningKeyword(threadID, keyword);
      if (success) {
        removed.push(keyword);
      } else {
        notFound.push(keyword);
      }
    }
    
    return { removed, notFound };
  }

  getServerInfo(threadID) {
    return this.serverInfo[threadID] || null;
  }

  setServerInfo(threadID, info) {
    this.serverInfo[threadID] = info;
    this.saveJSON(this.serverInfoFile, this.serverInfo);
  }
}

module.exports = DataManager;
