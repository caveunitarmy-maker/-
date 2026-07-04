const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const fs = require("fs");
const path = require("path");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(__dirname, "..", ".env"));

const DEFAULT_IDLE_TIMEOUT_MS = 600000;
const DEFAULT_REPLY_COOLDOWN_MS = 15000;
const THREAD_INACTIVITY_TIMEOUT_MS = 6 * 60 * 60 * 1000;
const ADMIN_USER_ID = "1108736717063733309";
const DIRECTOR_ROLE_ID = "1434909470106058842";
const DIRECTOR_MENTION = `<@&${DIRECTOR_ROLE_ID}>`;
const CLOSE_KEYWORDS = ["처리완료", "처리 완료", "처완", "처치완료", "처리완", "완려"];
const REJECT_KEYWORDS = ["기각"];
const GUIDE_LINK =
  "||https://discord.com/channels/1279685629751459902/1489031278610223154/1498703996066729984||";
const ERROR_EMOJI = "<:remove:1520984632315744520>";
const CHECK_EMOJI = "<:check:1520984249828642907>";

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const config = {
  token: process.env.DISCORD_TOKEN?.trim(),
  allowedGuildId: process.env.ALLOWED_GUILD_ID?.trim(),
  allowedChannelId: process.env.ALLOWED_CHANNEL_ID?.trim(),
  replyCooldownMs: parsePositiveInteger(process.env.REPLY_COOLDOWN_MS, DEFAULT_REPLY_COOLDOWN_MS),
  idleTimeoutMs: parsePositiveInteger(process.env.IDLE_TIMEOUT_MS, DEFAULT_IDLE_TIMEOUT_MS),
};

const idleMessages = [
  "이렇게 조용할 수가 있나..",
  "고요하다 못해 적막하네.",
  "정적이 귀를 때리네.",
  "여기 서버 맞지..?",
  "아무도 없는 줄 알았잖아.",
  "지금 채팅창 일시정지된 거 아니지?",
  "화면 너머 숨소리까지 들릴 정도네.",
  "평화롭다 못해 무섭네.",
  "고요함이 서버를 지배하는 중.",
  "채팅창이 휴가 갔나.",
  "지금 서버에 나만 있는 거 아니지?",
  "적막함 MAX.",
  "지금은 정적이 열일하네.",
];

const adminCommand = new SlashCommandBuilder()
  .setName("admin")
  .setDescription("마스터 컨트롤 패널을 엽니다.")
  .toJSON();

// 각 규칙은 analyzeMessages에서 미리 계산해둔 평가 결과(evalContext)를 받아 검사한다.
// 동일한 텍스트를 규칙마다 다시 스캔하지 않도록 isRequest/hasNickname/hasPath/hasGroupJoin/
// hasMention/isComplete 값을 한 번만 계산해서 재사용한다.
const rules = [
  {
    name: "missing-nickname-rank",
    test: ({ hasNickname }) => !hasNickname,
    replies: [
      `${ERROR_EMOJI} 닉네임이 없는데 도대체 뭘 확인하라는거야? ${GUIDE_LINK}`,
      `${ERROR_EMOJI} 닉네임은 적어줘. 양식이 장식은 아니잖아.. ${GUIDE_LINK}`,
    ],
  },
  {
    name: "missing-path",
    test: ({ hasNickname, hasPath }) => hasNickname && !hasPath,
    replies: [
      `${ERROR_EMOJI} 뭐 빠뜨린거 없어? ${GUIDE_LINK}`,
      `${ERROR_EMOJI} 경로랑 그룹가입 신청여부도 같이 적어줘. ${GUIDE_LINK}`,
    ],
  },
  {
    name: "missing-group-join",
    test: ({ hasPath, hasGroupJoin }) => hasPath && !hasGroupJoin,
    replies: [
      `${ERROR_EMOJI} 경로까지 적어놓고 그룹가입 신청여부는 왜 빠진거임.. ${GUIDE_LINK}`,
      `${ERROR_EMOJI} 그룹가입 신청여부도 적어줘. O인지 X인지 알아맞히라는건가.. ${GUIDE_LINK}`,
    ],
  },
  {
    name: "missing-director-mention",
    test: ({ hasGroupJoin, hasMention }) => hasGroupJoin && !hasMention,
    replies: [
      "마지막에 수뇌부 멘션도 붙여야지.. 수뇌부가 냄새 맡고 찾아오는건 아니잖아.",
      "멘션하면 더 빨리 올지도..?",
      "멘션 한 번이면 될 일을 운에 맡기네.",
      "요청은 올렸고, 발견은 담당자 몫? 쉽지 않네.",
      "부르지도 않았는데 오면 그게 더 무섭지.",
    ],
  },
  {
    name: "completed-form",
    test: ({ isComplete }) => isComplete,
    replies: [
      `${CHECK_EMOJI} 양식은 일단 맞는거 같네. 기다리면 될듯.`,
      `${CHECK_EMOJI} 이 정도면 볼만은 하네.`,
      `${CHECK_EMOJI} 10분이상 기다려도 안오면 수뇌부 집주소 찾아가. 집주소 -> ||뿡||`,
      `${CHECK_EMOJI} 기다리면 될 듯... 근데 수뇌부가 잠수타면 그냥 전설이 되는 거지.`,
      `${CHECK_EMOJI} 언젠가 한번 『수뇌부 실종 사건』으로 학계에 보고된적이 있지..`,
      `${CHECK_EMOJI} 이제 남은 건 기다림과 인내뿐.`,
      `${CHECK_EMOJI} 기다리면 온다... 아마도.`,
      `${CHECK_EMOJI} 언젠가는 오겠지. 언젠가는.`,
      `${CHECK_EMOJI} '기다림도 콘텐츠다.'`,
      `${CHECK_EMOJI} 곧이라고 했으니까... 곧이겠지.`,
      `${CHECK_EMOJI} 수뇌부도 지금 열심히 일하고... 있겠지?`,
      `${CHECK_EMOJI} 기다리는데, 아직은 정상 범위...라고 믿자.`,
      `${CHECK_EMOJI} 기다려. 수뇌부도 사람이다.. 아마도.`,
      `${CHECK_EMOJI} 기다리는 것도 숙련되면 재능이다.`,
      `${CHECK_EMOJI} 인내심 테스트 시작.`,
      `${CHECK_EMOJI} 수뇌부 출현 확률 계산 중...`,
      `${CHECK_EMOJI} 오늘 안에 오면 성공, 지금 오면 기적.`,
      `${CHECK_EMOJI} 에브리원 공지 하나면 모든 게 해결될 텐데.`,
      `${CHECK_EMOJI} 이쯤 되면 다 같이 기다리는 전문가.`,
      `${CHECK_EMOJI} 침착해. 아직 서버가 뒤집힌 건 아니야.`,
      `${CHECK_EMOJI} 기다림 끝에 수뇌부가 있다는 전설이 있어.`,
      `${CHECK_EMOJI} 아직은 희망회로가 잘 돌아가는 중.`,
      `${CHECK_EMOJI} 처리 중일 수도 있고... 커피 마시는 중일 수도 있고...`,
      `${CHECK_EMOJI} 기다리는 동안 심호흡 한 번.`,
      `${CHECK_EMOJI} 오늘도 평화로운 수뇌부 대기실.`,
    ],
  },
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const lastReplyAtByChannel = new Map();
const activeBotReplyThreads = new Set();
const threadIdleTimers = new Map();
let idleTimer;

function isIdleMessageEnabled() {
  return idleMessages.length > 0 && config.idleTimeoutMs > 0;
}

function clearIdleTimer() {
  if (!idleTimer) {
    return;
  }

  clearTimeout(idleTimer);
  idleTimer = undefined;
}

function clearThreadIdleTimer(thread) {
  if (!thread?.id) {
    return;
  }

  const existingTimer = threadIdleTimers.get(thread.id);
  if (existingTimer) {
    clearTimeout(existingTimer);
    threadIdleTimers.delete(thread.id);
  }
}

function scheduleThreadAutoClose(thread) {
  if (!thread?.id || !thread?.isThread?.()) {
    return;
  }

  clearThreadIdleTimer(thread);

  const timer = setTimeout(async () => {
    threadIdleTimers.delete(thread.id);

    try {
      if (thread.archived || thread.locked) {
        return;
      }

      await thread.setArchived(true);
    } catch (error) {
      console.error("스레드 자동 종료 중 오류:", error);
    }
  }, THREAD_INACTIVITY_TIMEOUT_MS);

  timer.unref?.();
  threadIdleTimers.set(thread.id, timer);
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function normalize(text) {
  return String(text ?? "").toLowerCase().replace(/\s+/g, "");
}

function hasAny(text, keywords) {
  const normalizedText = normalize(text);
  return keywords.some((keyword) => normalizedText.includes(normalize(keyword)));
}

function hasAll(text, keywords) {
  const normalizedText = normalize(text);
  return keywords.every((keyword) => normalizedText.includes(normalize(keyword)));
}

// 라벨 글자 사이에 공백이 들쭉날쭉 섞여 있어도(예: "그룹가입 신청 여부") 매칭되도록
// 글자 하나하나 사이에 \s*를 끼워 넣은 정규식을 만든다. 라벨 뒤에는 공백 또는 줄 끝이
// 와야만(단어 경계) 매칭을 인정해서 "닉네임" 라벨이 "닉네임변경여부" 같은 다른 단어
// 중간에 잘못 걸리는 걸 막는다.
function buildLooseLabelPatternSource(label) {
  const escapedChars = [...normalize(label)].map((char) =>
    char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  return escapedChars.map((char, index) => (index === 0 ? char : `(?:\\s|[:.\\-])*${char}`)).join("");
}

function buildLooseLabelPattern(label) {
  return new RegExp(`^${buildLooseLabelPatternSource(label)}(?=\\s|$)`, "i");
}

function getFieldValue(text, labels) {
  const lines = text.split(/\r?\n/);
  const labelsByLength = [...labels].sort((a, b) => normalize(b).length - normalize(a).length);
  const allLabelSources = labelsByLength.map(buildLooseLabelPatternSource).join("|");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    for (const candidate of labelsByLength) {
      const labelSource = buildLooseLabelPatternSource(candidate);
      const match = line.match(
        new RegExp(
          `(^|\\s|[\\p{P}\\p{S}])${labelSource}(?:\\s*[:\\-]?\\s*|\\s+)([^:\\n\\r]+?)(?=(?:${allLabelSources})(?:\\s*[:\\-]?\\s*|\\s+)|$)`,
          "iu",
        ),
      );
      if (!match) {
        continue;
      }

      const value = (match[2] || "").trim();
      if (value) {
        return value;
      }
    }

    // 콜론이 없는 "라벨 값" 형태(예: "닉네임 juj1144")도 인정한다.
    for (const candidate of labelsByLength) {
      const match = line.match(buildLooseLabelPattern(candidate));
      if (!match) {
        continue;
      }

      const value = line.slice(match[0].length).trim();
      if (value) {
        return value;
      }
    }
  }

  const normalizedText = text.replace(/\r?\n/g, " ");
  for (const candidate of labelsByLength) {
    const labelSource = buildLooseLabelPatternSource(candidate);
    const regex = new RegExp(
      `(^|\\s|[\\p{P}\\p{S}])${labelSource}(?:\\s*[:\\-]?\\s*|\\s+)([^\\n\\r]+?)(?=(?:${allLabelSources})(?:\\s*[:\\-]?\\s*|\\s+)|$)`,
      "iu",
    );
    const match = normalizedText.match(regex);
    if (!match) {
      continue;
    }

    const value = (match[2] || "").trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function hasFilledField(text, labels) {
  return getFieldValue(text, labels).length > 0;
}

function isAuthRequest(text) {
  if (hasAll(text, ["# 인증 요청 양식", "## 예시"])) {
    return false;
  }

  return hasAny(text, ["닉네임", "경로", "그룹 가입", "그룹가입", DIRECTOR_MENTION]);
}

function hasValidNicknameRank(text) {
  const extractedNickname = extractNicknameFromText(text);
  if (extractedNickname) {
    return true;
  }

  return hasFilledField(text, ["닉네임 및 계급", "닉네임및계급", "닉네임"]);
}

function hasValidGroupJoinValue(text) {
  const value = getFieldValue(text, [
    "그룹 가입 신청여부",
    "그룹가입 신청여부",
    "그룹가입신청여부",
    "그룹 가입",
    "그룹가입",
  ]);

  return /^(o|x|0|ㅇ|ㄴ|○|×)$/i.test(value.trim());
}

function extractNicknameFromText(text) {
  const rawValue = getFieldValue(text, [
    "닉네임 및 계급",
    "닉네임및계급",
    "닉네임",
  ]);

  const candidates = [];
  if (rawValue) {
    candidates.push(rawValue);
  }

  const fallbackText = text.replace(/\s+/g, " ").trim();
  if (fallbackText) {
    candidates.push(fallbackText);
  }

  for (const candidate of candidates) {
    const tokens = candidate
      .split(/[^A-Za-z0-9_가-힣]+/)
      .map((token) => token.trim())
      .filter(Boolean);

    for (const token of tokens) {
      const letters = (token.match(/[A-Za-z]+/g) || []).join("");
      const hasEnoughLetters = letters.length >= 3;
      const hasUsernameLikeChars = /[A-Za-z0-9_]/.test(token);
      if (hasEnoughLetters && hasUsernameLikeChars) {
        return token;
      }
    }
  }

  const fallbackToken = (rawValue.match(/[A-Za-z0-9_]+/g) || []).join("");
  return fallbackToken;
}

async function fetchRobloxUserProfile(username) {
  if (!username) {
    return { exists: false };
  }

  try {
    const response = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [username] }),
    });

    if (!response.ok) {
      return { exists: false };
    }

    const json = await response.json();
    const result = json.data?.[0];
    if (!result) {
      return { exists: false };
    }

    const userId = result.id;
    const detailsResponse = await fetch(`https://users.roblox.com/v1/users/${userId}`);
    const details = detailsResponse.ok ? await detailsResponse.json() : null;
    const groupResponse = await fetch(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
    const groupJson = groupResponse.ok ? await groupResponse.json() : null;

    return {
      exists: true,
      userId,
      username: result.name,
      displayName: result.displayName,
      profileUrl: `https://www.roblox.com/users/${userId}/profile`,
      created: details?.created,
      groups: Array.isArray(groupJson?.data) ? groupJson.data : [],
    };
  } catch (error) {
    console.error("Roblox 프로필 조회 중 오류:", error);
    return { exists: false };
  }
}

function createRobloxProfileEmbed(username, profile) {
  const embed = new EmbedBuilder()
    .setTitle("계정확인 매니저")
    .setColor(profile?.exists ? 0x2ecc71 : 0xeb5757)
    .addFields(
      { name: "닉네임", value: username || "감지된 닉네임 없음", inline: true },
      {
        name: "존재 여부",
        value: profile?.exists ? "✅ 존재함" : "❌ 존재하지 않음",
        inline: true,
      },
    );

  if (profile?.exists) {
    const created = profile.created ? new Date(profile.created) : null;
    const accountAge = created ? getAccountAge(created) : "알 수 없음";

    embed.addFields(
      { name: "프로필 링크", value: profile.profileUrl, inline: false },
      { name: "표시 이름", value: profile.displayName || profile.username, inline: true },
      { name: "계정 생성일", value: created ? formatDate(created) : "알 수 없음", inline: true },
      { name: "계정 나이", value: accountAge, inline: true },
      { name: "Caveful Games", value: getGroupRoleText(profile, 8485983), inline: false },
      { name: "Cave Army Rank Group [CAVE]", value: getGroupRoleText(profile, 562593164), inline: false },
      { name: "CA | Training&Doctrine Command", value: getGroupRoleText(profile, 724594083), inline: false },
    );
  }

  return embed;
}

function getGroupRoleText(profile, groupId) {
  if (!profile?.groups?.length) {
    return "조회할 수 없음";
  }

  const group = profile.groups.find((item) => item.group?.id === groupId);
  if (!group) {
    return "가입 안 됨";
  }

  return `✅ ${group.role?.name || "알 수 없음"} (Rank ${group.role?.rank ?? "-"})`;
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getAccountAge(createdDate) {
  const now = new Date();
  const years = now.getFullYear() - createdDate.getFullYear();
  const months = now.getMonth() - createdDate.getMonth();
  const days = now.getDate() - createdDate.getDate();

  let ageYears = years;
  let ageMonths = months;
  let ageDays = days;

  if (ageDays < 0) {
    ageMonths -= 1;
    ageDays += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }
  if (ageMonths < 0) {
    ageYears -= 1;
    ageMonths += 12;
  }

  const parts = [];
  if (ageYears > 0) parts.push(`${ageYears}년`);
  if (ageMonths > 0) parts.push(`${ageMonths}개월`);
  if (ageDays > 0) parts.push(`${ageDays}일`);
  return parts.length ? parts.join(" ") : "오늘 생성됨";
}

function hasDirectorMention(text) {
  return hasAny(text, [DIRECTOR_MENTION]);
}

// 텍스트를 한 번만 스캔해 인증 양식 평가에 필요한 모든 플래그를 계산한다.
// 각 단계는 이전 단계가 충족된 경우에만 의미가 있으므로 앞 단계 결과에 의존해 누적 계산한다.
function evaluateAuthRequest(text) {
  const isRequest = isAuthRequest(text);
  const hasNickname = isRequest && hasValidNicknameRank(text);
  const hasPath = hasNickname && hasFilledField(text, ["경로"]);
  const hasGroupJoin = hasPath && hasValidGroupJoinValue(text);
  const hasMention = hasDirectorMention(text);
  const isComplete = hasGroupJoin && hasMention;

  return { isRequest, hasNickname, hasPath, hasGroupJoin, hasMention, isComplete };
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "꺼짐";
  }

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];

  if (hours) parts.push(`${hours}시간`);
  if (minutes) parts.push(`${minutes}분`);
  if (seconds || parts.length === 0) parts.push(`${seconds}초`);

  return parts.join(" ");
}

function canUseAdminPanel(interaction) {
  return interaction.user.id === ADMIN_USER_ID;
}

function createAdminPanel() {
  const embed = new EmbedBuilder()
    .setTitle("마스터 컨트롤 패널")
    .setDescription("소영 봇의 현재 작동 상태입니다.")
    .setColor(0x2f80ed)
    .addFields(
      {
        name: "패널 사용자",
        value: `<@${ADMIN_USER_ID}>`,
        inline: true,
      },
      {
        name: "작동 서버",
        value: config.allowedGuildId || "전체 서버",
        inline: true,
      },
      {
        name: "작동 채널",
        value: "명령어를 실행한 채널",
        inline: true,
      },
      {
        name: "무응답 안내",
        value: isIdleMessageEnabled() ? formatDuration(config.idleTimeoutMs) : "꺼짐",
        inline: true,
      },
      {
        name: "자동 답장 쿨다운",
        value: formatDuration(config.replyCooldownMs),
        inline: true,
      },
      {
        name: "등록 규칙",
        value: `${rules.length}개`,
        inline: true,
      },
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("admin:compose")
      .setLabel("메시지 작성")
      .setStyle(ButtonStyle.Primary),
  );

  return {
    embeds: [embed],
    components: [row],
    flags: MessageFlags.Ephemeral,
  };
}

function createAdminModal() {
  return new ModalBuilder()
    .setCustomId("admin:compose-modal")
    .setTitle("관리자 메시지 전송")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("adminMessage")
          .setLabel("보낼 메시지")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("이곳에 보낼 메시지를 입력하세요.")
          .setRequired(true)
          .setMaxLength(2000),
      ),
    );
}

async function getConfiguredChannel() {
  if (!config.allowedChannelId) {
    return undefined;
  }

  return client.channels.fetch(config.allowedChannelId).catch(() => undefined);
}

async function upsertCommand(manager, commandData) {
  const commands = await manager.fetch();
  const existingCommand = commands.find((command) => command.name === commandData.name);

  if (existingCommand) {
    return manager.edit(existingCommand.id, commandData);
  }

  return manager.create(commandData);
}

async function registerCommands(readyClient) {
  await upsertCommand(
    readyClient.application.commands,
    adminCommand
  );

  console.log("/admin 명령어를 전역으로 등록했습니다.");
}

function analyzeMessage(message) {
  const text = message.content || "";
  const evalContext = evaluateAuthRequest(text);

  if (!evalContext.isRequest) {
    return undefined;
  }

  const matchedRule = rules.find((rule) => rule.test(evalContext));

  if (!matchedRule) {
    return undefined;
  }

  return {
    rule: matchedRule,
    message,
  };
}

// 요청 메시지에 달린 스레드가 있으면 재사용하고, 없으면 새로 만든다.
// 메시지 자체가 이미 스레드 안에 있다면(스레드 채널) 그 스레드를 그대로 사용한다.
async function getOrCreateReplyThread(message) {
  if (message.channel.isThread()) {
    return message.channel;
  }

  if (message.thread) {
    return message.thread;
  }

  const nickname = extractNicknameFromText(message.content) || message.author.username;

  try {
    return await message.startThread({
      name: `인증 요청 - ${nickname}`.slice(0, 100),
      autoArchiveDuration: 60,
      reason: "인증 요청 처리용 스레드",
    });
  } catch (error) {
    console.error("스레드 생성 중 오류:", error);
    return undefined;
  }
}

async function sendDirectorMentionIfNeeded(analysis, thread) {
  if (analysis.rule.name !== "missing-director-mention") {
    return;
  }

  if (thread) {
    await thread.send(DIRECTOR_MENTION);
  } else {
    await analysis.message.reply(DIRECTOR_MENTION);
  }
}

async function sendPreparedReply(message) {
  const now = Date.now();
  const lastReplyAt = lastReplyAtByChannel.get(message.channel.id) || 0;
  if (now - lastReplyAt < config.replyCooldownMs) {
    return;
  }

  const analysis = analyzeMessage(message);

  if (!analysis) {
    return;
  }

  lastReplyAtByChannel.set(message.channel.id, now);

  const baseReply = pickRandom(analysis.rule.replies);
  const isMissingMention = analysis.rule.name === "missing-director-mention";
  const validityText = isMissingMention
    ? undefined
    : analysis.rule.name === "completed-form"
    ? "`양식 유효`"
    : "`양식 무효`";

  const nickname = extractNicknameFromText(analysis.message.content);
  const robloxProfile = await fetchRobloxUserProfile(nickname);
  const profileEmbed = createRobloxProfileEmbed(nickname, robloxProfile);

  const replyOptions = {
    content: formatReplyWithValidity(baseReply, validityText, analysis.rule.name === "completed-form"),
    embeds: [profileEmbed],
  };

  const thread = await getOrCreateReplyThread(analysis.message);

  if (thread) {
    await thread.send(replyOptions);
    activeBotReplyThreads.add(thread.id);
    scheduleThreadAutoClose(thread);
  } else {
    await analysis.message.reply(replyOptions);
  }

  await sendDirectorMentionIfNeeded(analysis, thread);
}

const DIRECTOR_ROLE_IDS = new Set([DIRECTOR_ROLE_ID, "1520765889337753791"]);

function isDirectorMember(member) {
  return [...DIRECTOR_ROLE_IDS].some((roleId) => member?.roles?.cache?.has(roleId));
}

function stripLeadingEmoji(text) {
  return text.replace(/^[\s\u200B]*(?:(?:<a?:[\w\d_]+:\d+>)|[\p{Emoji_Presentation}\p{Extended_Pictographic}]|[:;][\-~]?[()DPpOo])+[\s\u200B]*/u, "");
}

function formatReplyWithValidity(baseReply, validityText, isValid) {
  if (!validityText) {
    return baseReply;
  }

  const cleanedReply = stripLeadingEmoji(baseReply).trim();
  const validityPrefix = isValid ? `${CHECK_EMOJI} ` : `${ERROR_EMOJI} `;
  return `${validityPrefix}${validityText}\n> ${cleanedReply}`;
}

function isCloseKeyword(text) {
  if (!text) {
    return false;
  }

  const normalized = normalize(text);
  return CLOSE_KEYWORDS.some((keyword) => normalized.includes(normalize(keyword)));
}

function isRejectKeyword(text) {
  if (!text) {
    return false;
  }

  const normalized = normalize(text);
  return REJECT_KEYWORDS.some((keyword) => normalized.includes(normalize(keyword)));
}

function createThreadRejectEmbed(processor) {
  return new EmbedBuilder()
    .setTitle("요청 기각 처리")
    .setDescription("수뇌부가 이 요청을 기각 처리하고 스레드를 닫았습니다.")
    .setColor(0xeb5757)
    .addFields(
      { name: "처리한 수뇌부", value: `<@${processor.id}>`, inline: false },
    );
}

function createThreadCompleteEmbed(processor) {
  return new EmbedBuilder()
    .setTitle("요청 처리 완료")
    .setDescription("수뇌부가 이 요청을 처리 완료하고 스레드를 닫았습니다.")
    .setColor(0x2f80ed)
    .addFields(
      { name: "처리한 수뇌부", value: `<@${processor.id}>`, inline: false },
    );
}

async function reactToThreadStarterMessage(thread, fallbackMessage, emoji) {
  try {
    if (thread?.fetchStarterMessage) {
      const starterMessage = await thread.fetchStarterMessage();
      if (starterMessage) {
        await starterMessage.react(emoji);
        return;
      }
    }

    if (fallbackMessage) {
      await fallbackMessage.react(emoji);
    }
  } catch (error) {
    console.error("스레드 시작 메시지에 리액션 추가 중 오류:", error);
  }
}

function scheduleIdleMessage(channel) {
  if (!isIdleMessageEnabled()) {
    return;
  }

  clearIdleTimer();

  idleTimer = setTimeout(async () => {
    idleTimer = undefined;

    try {
      const targetChannel = await client.channels.fetch(channel.id);
      if (targetChannel?.isTextBased()) {
        await targetChannel.send(pickRandom(idleMessages));
      }
    } catch (error) {
      console.error("무응답 안내 메시지 전송 중 오류:", error);
    }
  }, config.idleTimeoutMs);

  idleTimer.unref?.();
}

function shouldIgnoreMessage(message) {
  if (message.author.bot || !message.guild) {
    return true;
  }

  if (config.allowedGuildId && message.guild.id !== config.allowedGuildId) {
    return true;
  }

  return config.allowedChannelId && message.channel.id !== config.allowedChannelId;
}

async function handleAdminModalSubmit(interaction) {
  if (!canUseAdminPanel(interaction)) {
    await interaction.reply({
      content: "이 명령어는 지정된 사용자만 사용할 수 있습니다.",
      ephemeral: true,
    });
    return;
  }

  const content = interaction.fields.getTextInputValue("adminMessage");
  const channel = interaction.channel;

  if (!channel?.isTextBased()) {
    await interaction.reply({
      content: "메시지를 보낼 채널을 찾지 못했습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await channel.send({ content });
    await interaction.reply({
      content: `메시지를 <#${channel.id}> 채널로 전송했습니다.`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error("관리자 메시지 전송 중 오류:", error);
    await interaction.reply({
      content: "메시지 전송 중 오류가 발생했습니다.",
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleAdminInteraction(interaction) {
  if (!canUseAdminPanel(interaction)) {
    await interaction.reply({
      content: "이 명령어는 지정된 사용자만 사용할 수 있습니다.",
      ephemeral: true,
    });
    return;
  }

  if (interaction.isChatInputCommand()) {
    await interaction.reply(createAdminPanel());
    return;
  }

  if (interaction.customId === "admin:compose") {
    await interaction.showModal(createAdminModal());
    return;
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`${readyClient.user.tag} 준비 완료`);
  await registerCommands(readyClient);

  if (config.allowedGuildId) {
    console.log(`서버 ${config.allowedGuildId}에서만 작동합니다.`);
  }

  if (config.allowedChannelId) {
    console.log(`채널 ${config.allowedChannelId}에서만 작동합니다.`);
  }

  const channel = await getConfiguredChannel();
  if (channel?.isTextBased() && isIdleMessageEnabled()) {
    scheduleIdleMessage(channel);
    console.log(`${config.idleTimeoutMs}ms 동안 채팅이 없으면 안내 메시지를 보냅니다.`);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "admin") {
      await handleAdminInteraction(interaction);
    }
    return;
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === "admin:compose-modal") {
      await handleAdminModalSubmit(interaction);
    }
    return;
  }

  if (!interaction.isButton()) {
    return;
  }

  if (interaction.customId.startsWith("admin:")) {
    await handleAdminInteraction(interaction);
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) {
    return;
  }

  if (message.channel.isThread() && activeBotReplyThreads.has(message.channel.id) && isDirectorMember(message.member)) {
    if (isRejectKeyword(message.content)) {
      try {
        clearThreadIdleTimer(message.channel);
        await reactToThreadStarterMessage(message.channel, message, "❌");
        await message.channel.send({ embeds: [createThreadRejectEmbed(message.member)] });
        await message.channel.setArchived(true);
      } catch (error) {
        console.error("스레드 기각 처리 중 오류:", error);
      } finally {
        activeBotReplyThreads.delete(message.channel.id);
      }
    } else if (isCloseKeyword(message.content)) {
      try {
        clearThreadIdleTimer(message.channel);
        await reactToThreadStarterMessage(message.channel, message, "✅");
        await message.channel.send({ embeds: [createThreadCompleteEmbed(message.member)] });
        await message.channel.setArchived(true);
      } catch (error) {
        console.error("처리완료 처리 중 오류:", error);
      } finally {
        activeBotReplyThreads.delete(message.channel.id);
      }
    }
  }

  if (shouldIgnoreMessage(message)) {
    return;
  }

  if (message.channel.isThread()) {
    const existingTimer = threadIdleTimers.get(message.channel.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      threadIdleTimers.delete(message.channel.id);
    }
    scheduleThreadAutoClose(message.channel);
  }

  scheduleIdleMessage(message.channel);

  try {
    await sendPreparedReply(message);
  } catch (error) {
    console.error("채널 분석 중 오류:", error);
  }
});

if (!config.token || config.token.includes("여기에") || config.token.startsWith("put_your_")) {
  throw new Error(".env 파일에 DISCORD_TOKEN을 넣어주세요.");
}

client.login(config.token);

const http = require("http");

const PORT = process.env.PORT || 3000;

// 5분(300초)마다 https://soyeongi.onrender.com을 호출하는 함수
function keepAliveRequest() {
  const keepAliveUrl = "https://soyeongi.onrender.com";
  
  fetch(keepAliveUrl)
    .then((response) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Keep-alive 요청 완료: ${response.status}`);
    })
    .catch((error) => {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}] Keep-alive 요청 실패:`, error.message);
    });
}

// 5분(300000ms)마다 keep-alive 요청 전송
setInterval(keepAliveRequest, 300000);

// 서버 시작 후 10초 뒤에 첫 번째 keep-alive 요청 실행
setTimeout(keepAliveRequest, 10000);

http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot is running");
}).listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
