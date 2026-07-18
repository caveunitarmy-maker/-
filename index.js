const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  GuildExplicitContentFilter, // 추가: 서버 보안 정보(유해 콘텐츠 필터) 표시용
  GuildMFALevel, // 추가: 서버 보안 정보(관리자 2단계 인증 요구 여부) 표시용
  GuildVerificationLevel, // 추가: 서버 보안 정보(인증 단계) 표시용
  MessageFlags,
  ModalBuilder,
  OverwriteType, // 추가: 채널 권한 오버라이트 타입 구분용
  PermissionsBitField, // 추가
  SlashCommandBuilder,
  StringSelectMenuBuilder,
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
const GUIDE_LINK = "https://discord.com/channels/1279685629751459902/1489031278610223154/1498703996066729984";
const ERROR_EMOJI = "<:remove:1524097189666750545>";
const CHECK_EMOJI = "<:check:1524094971043381301>";

const FAQ_SELECT_CUSTOM_ID = "faq:select";
const FAQ_ITEMS = [
  {
    value: "how-long",
    label: "인증은 얼마나 걸리나요?",
    emoji: "⏱️",
    answer:
      "보통 수뇌부가 확인하는 대로 처리돼요. 아무리 지나도 소식이 없으면 새 메시지로 인증 요청을 남겨주는것도 좋아요.",
  },
  {
    value: "wrong-nickname",
    label: "닉네임이 다르게 표시돼요",
    emoji: "🔎",
    answer:
      "닉네임 및 계급 항목에 정확한 로블록스 유저네임을 적었는지 확인해주세요. 표시 이름(닉네임)이 아니라 실제 계정 아이디 기준으로 조회돼요.",
  },
  {
    value: "group-not-joined",
    label: "그룹 가입 요청 수락이 안 됐다고 나와요",
    emoji: "🚫",
    answer:
      "`CA | Training&Doctrine Command` 그룹 기준 수뇌부가 인증채널에서 확인하고 승인하는 방식이에요. 정상이니 기다리면 돼요.",
  },
  {
    value: "form-format",
    label: "양식은 어디서 확인하나요?",
    emoji: "📄",
    answer: `양식 안내는 여기서 확인할 수 있어요: ${GUIDE_LINK}`,
  },
  {
    value: "form-mismatch",
    label: "양식이 맞지 않다고 떠요",
    emoji: "⚠️",
    answer:
      "가끔씩 오탐이 발생해요. 수뇌부 재량으로 인증처리가 진행되니 크게 신경쓰지 않아도 돼요.",
  },
  {
    value: "thread-closed",
    label: "스레드가 자동으로 닫혔어요",
    emoji: "🔒",
    answer:
      "일정 시간 동안 활동이 없으면 수뇌부가 스레드를 보관 처리해요. 다시 요청하고 싶다면 새 메시지로 인증 요청을 남겨주세요.",
  },
];

function createFaqSelectRow() {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(FAQ_SELECT_CUSTOM_ID)
    .setPlaceholder("자주 묻는 질문")
    .addOptions(
      FAQ_ITEMS.map((item) => ({
        label: item.label,
        value: item.value,
        emoji: item.emoji,
      })),
    );

  return new ActionRowBuilder().addComponents(selectMenu);
}

async function handleFaqSelectInteraction(interaction) {
  const selectedValue = interaction.values?.[0];
  const faqItem = FAQ_ITEMS.find((item) => item.value === selectedValue);

  if (!faqItem) {
    await interaction.reply({
      content: "질문을 찾지 못했어요.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const faqEmbed = new EmbedBuilder()
    .setTitle(`${faqItem.emoji ? `${faqItem.emoji} ` : ""}${faqItem.label}`)
    .setDescription(faqItem.answer)
    .setColor(0x2f80ed);

  await interaction.reply({
    embeds: [faqEmbed],
    flags: MessageFlags.Ephemeral,
  });
}

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
      `내가 보기엔 양식이 안맞는것 같은데.. ${GUIDE_LINK}`,
    ],
  },
  {
    name: "missing-group-join",
    test: ({ hasPath, hasGroupJoin }) => hasPath && !hasGroupJoin,
    replies: [
      `내가 보기엔 양식이 안맞는것 같은데.. ${GUIDE_LINK}`,
    ],
  },
  {
    name: "missing-director-mention",
    test: ({ hasGroupJoin, hasMention }) => hasGroupJoin && !hasMention,
    replies: [
      "마지막에 수뇌부 멘션도 붙여야지..",
      "멘션하면 더 빨리 올지도..?",
      "멘션 한 번이면 될 일을 운에 맡기네.",
      "요청은 올렸고, 발견은 담당자 몫? 쉽지 않네.",
      "부르지도 않았는데 오면 그게 더 무섭지.",
      "멘션은 못참지.",
      "멘션을 빼먹으면 그대로 묻힌다고.",
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
      `${CHECK_EMOJI} 읽씹만 아니면 된다..`,
      `${CHECK_EMOJI} 도움...`,
      `${CHECK_EMOJI} 설마 또 타이밍 게임인가.`,
      `${CHECK_EMOJI} 그래. 밥은 먹고 하자고.`,
      `${CHECK_EMOJI} 오늘 안에는 오겠지...?`,
      `${CHECK_EMOJI} 설마 알림을 꺼둔 건 아니겠지.`,
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
    } finally {
      // 처리완료 없이 자동 보관되는 스레드가 activeBotReplyThreads에 계속 남아
      // 메모리가 누적되는 것을 막기 위해 여기서 함께 정리한다.
      activeBotReplyThreads.delete(thread.id);
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
// 같은 라벨에 대해 매 메시지마다 정규식을 새로 만들 필요가 없으므로 캐시해서 재사용한다.
const looseLabelPatternSourceCache = new Map();
function buildLooseLabelPatternSource(label) {
  if (looseLabelPatternSourceCache.has(label)) {
    return looseLabelPatternSourceCache.get(label);
  }

  const escapedChars = [...normalize(label)].map((char) =>
    char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const source = escapedChars
    .map((char, index) => (index === 0 ? char : `(?:\\s|[:.\\-])*${char}`))
    .join("");

  looseLabelPatternSourceCache.set(label, source);
  return source;
}

const looseLabelPatternCache = new Map();
function buildLooseLabelPattern(label) {
  if (looseLabelPatternCache.has(label)) {
    return looseLabelPatternCache.get(label);
  }

  const pattern = new RegExp(`^${buildLooseLabelPatternSource(label)}(?=\\s|$)`, "i");
  looseLabelPatternCache.set(label, pattern);
  return pattern;
}

function getFieldValue(text, labels) {
  const lines = text.split(/\r?\n/);
  const labelsByLength = [...labels].sort((a, b) => normalize(b).length - normalize(a).length);
  const allLabelSources = labelsByLength.map(buildLooseLabelPatternSource).join("|");

  // 줄 단위 매칭에 쓰이는 정규식은 라인 내용과 무관하게 후보 라벨에만 의존하므로,
  // 줄마다 다시 컴파일하지 않도록 라인 순회 전에 후보 라벨당 한 번씩만 생성한다.
  const lineMatchersByCandidate = labelsByLength.map((candidate) => ({
    candidate,
    regex: new RegExp(
      `(^|\\s|[\\p{P}\\p{S}])${buildLooseLabelPatternSource(candidate)}(?:\\s*[:\\-]?\\s*|\\s+)([^:\\n\\r]+?)(?=(?:${allLabelSources})(?:\\s*[:\\-]?\\s*|\\s+)|$)`,
      "iu",
    ),
  }));

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    for (const { regex } of lineMatchersByCandidate) {
      const match = line.match(regex);
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

// 링크(URL, 도메인) 형태의 문자열은 닉네임 후보에서 제외하기 위해 토큰화 전에 미리 제거한다.
// - https?:// 또는 www. 로 시작하는 구간 전체
// - "word.tld" 형태의 도메인 같은 문자열(예: abc.com, discord.gg)
const LINK_LIKE_PATTERN = /\b((?:https?:\/\/|www\.)\S+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/\S*)?)\b/gi;

function stripLinkLikeText(text) {
  return String(text ?? "").replace(LINK_LIKE_PATTERN, " ");
}

function isNumericOnlyToken(token) {
  return /^[0-9]+$/.test(token);
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
    const sanitizedCandidate = stripLinkLikeText(candidate);

    // 닉네임 구성 문자는 영문(A-Za-z), 숫자(0-9), 언더스코어(_)만 인정한다.
    // 그 외 문자(한글, 공백, 특수문자, 링크에서 남은 구두점 등)는 전부 구분자로 취급한다.
    const tokens = sanitizedCandidate
      .split(/[^A-Za-z0-9_]+/)
      .map((token) => token.trim())
      .filter(Boolean);

    for (const token of tokens) {
      if (isNumericOnlyToken(token)) {
        continue; // 숫자로만 이루어진 토큰은 닉네임으로 인정하지 않는다.
      }

      const letters = (token.match(/[A-Za-z]+/g) || []).join("");
      const hasEnoughLetters = letters.length >= 3;
      if (hasEnoughLetters) {
        return token;
      }
    }
  }

  const sanitizedRawValue = stripLinkLikeText(rawValue);
  const fallbackTokens = (sanitizedRawValue.match(/[A-Za-z0-9_]+/g) || []).filter(
    (token) => !isNumericOnlyToken(token),
  );

  return fallbackTokens[0] || "";
}

// 그룹 조회는 프로필 조회와 별도로 성공/실패를 추적한다.
// API 호출 실패(네트워크 오류, 레이트리밋 등)와 "실제로 그 그룹에 가입되어 있지 않음"을
// 구분하지 않으면, 호출이 실패했을 뿐인데도 모든 그룹이 "가입 안 됨"으로 잘못 표시될 수 있다.
async function fetchRobloxGroups(userId) {
  try {
    const groupResponse = await fetch(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
    if (!groupResponse.ok) {
      return { groups: [], failed: true };
    }

    const groupJson = await groupResponse.json();
    return {
      groups: Array.isArray(groupJson?.data) ? groupJson.data : [],
      failed: false,
    };
  } catch (error) {
    console.error("Roblox 그룹 조회 중 오류:", error);
    return { groups: [], failed: true };
  }
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
    const { groups, failed: groupsFetchFailed } = await fetchRobloxGroups(userId);

    return {
      exists: true,
      userId,
      username: result.name,
      displayName: result.displayName,
      profileUrl: `https://www.roblox.com/users/${userId}/profile`,
      created: details?.created,
      groups,
      groupsFetchFailed,
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
      { name: "CA | Training&Doctrine Command", value: getGroupRoleText(profile, 724594083, "가입요청 수락 안 됨"), inline: false },
    );
  }

  return embed;
}

function getGroupRoleText(profile, groupId, notJoinedText = "가입 안 됨") {
  // 그룹 API 호출 자체가 실패한 경우에만 "조회할 수 없음"을 띄운다.
  // 호출은 성공했는데 결과 배열이 비어있는 경우(= 실제로 어떤 그룹에도 가입돼 있지 않음)는
  // 정상적으로 "가입 안 됨" 계열 문구로 표시되어야 한다.
  if (profile?.groupsFetchFailed) {
    return "조회할 수 없음";
  }

  const group = profile?.groups?.find((item) => item.group?.id === groupId);
  if (!group) {
    return notJoinedText;
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

// 채널의 스레드 하나의 "마지막 활동 시각"을 판단한다.
// 가능하면 실제 마지막 메시지 시각을 조회하고, 그마저 실패하면 보관 시각/생성 시각으로 대체한다.
async function getThreadLastActivityTimestamp(thread) {
  try {
    const messages = await thread.messages.fetch({ limit: 1 });
    const lastMessage = messages.first();
    if (lastMessage) {
      return lastMessage.createdTimestamp;
    }
  } catch (error) {
    console.error(`스레드(${thread.id}) 마지막 메시지 조회 중 오류:`, error);
  }

  return thread.archiveTimestamp ?? thread.createdTimestamp ?? Date.now();
}

// 재시작 여부와 무관하게 항상 정확하도록, 메모리(Set/Map)에 의존하지 않고
// Discord API에서 채널의 활성 스레드 목록을 직접 조회해서 판단한다.
// 보관된(archived) 스레드는 탐지 대상에서 제외한다.
// - 전체 스레드 수: 채널에 열려있는 활성 스레드
// - 소영이가 연 스레드 수: 그 중 ownerId가 봇 자신인 스레드 (message.startThread로 생성됨)
// - 무활동 스레드: 소영이가 연 스레드 중 마지막 활동이 6시간 이상 지난 것
const PERMISSION_LABELS_KO = {
  CreateInstantInvite: "초대 코드 생성",
  KickMembers: "멤버 추방",
  BanMembers: "멤버 차단",
  Administrator: "관리자",
  ManageChannels: "채널 관리",
  ManageGuild: "서버 관리",
  AddReactions: "리액션 추가",
  ViewAuditLog: "감사 로그 보기",
  PrioritySpeaker: "우선 발언권",
  Stream: "화면 공유",
  ViewChannel: "채널 보기",
  SendMessages: "메시지 보내기",
  SendTTSMessages: "TTS 메시지 보내기",
  ManageMessages: "메시지 관리",
  EmbedLinks: "링크 임베드",
  AttachFiles: "파일 첨부",
  ReadMessageHistory: "메시지 기록 보기",
  MentionEveryone: "전체 멘션",
  UseExternalEmojis: "외부 이모지 사용",
  ViewGuildInsights: "서버 인사이트 보기",
  Connect: "음성 채널 연결",
  Speak: "음성 채널 발언",
  MuteMembers: "멤버 음소거",
  DeafenMembers: "멤버 헤드셋 음소거",
  MoveMembers: "멤버 이동",
  UseVAD: "음성 감지 사용",
  ChangeNickname: "닉네임 변경",
  ManageNicknames: "닉네임 관리",
  ManageRoles: "역할 관리",
  ManageWebhooks: "웹훅 관리",
  ManageEmojisAndStickers: "이모지/스티커 관리",
  ManageGuildExpressions: "서버 표현 관리",
  UseApplicationCommands: "슬래시 명령어 사용",
  RequestToSpeak: "발언 요청",
  ManageEvents: "이벤트 관리",
  ManageThreads: "스레드 관리",
  CreatePublicThreads: "공개 스레드 생성",
  CreatePrivateThreads: "비공개 스레드 생성",
  UseExternalStickers: "외부 스티커 사용",
  SendMessagesInThreads: "스레드에서 메시지 보내기",
  UseEmbeddedActivities: "액티비티 사용",
  ModerateMembers: "멤버 타임아웃",
  ViewCreatorMonetizationAnalytics: "수익화 분석 보기",
  UseSoundboard: "사운드보드 사용",
  UseExternalSounds: "외부 사운드 사용",
  SendVoiceMessages: "음성 메시지 보내기",
};

function truncateForEmbed(text, maxLength = 1024) {
  if (!text) {
    return "-";
  }
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function formatPermissionsList(permissions) {
  if (!permissions) {
    return "조회 불가";
  }

  if (permissions.has(PermissionsBitField.Flags.Administrator)) {
    return "🛡️ 관리자 (모든 권한 포함)";
  }

  const permissionNames = permissions.toArray();
  if (permissionNames.length === 0) {
    return "권한 없음";
  }

  return permissionNames
    .map((name) => PERMISSION_LABELS_KO[name] || name)
    .join(", ");
}

// 봇 자신이 현재 서버에서 가진 역할 목록과 권한을 조회한다.
// guild.members.me가 캐시에 없으면 fetchMe()로 직접 조회한다.
async function getBotPermissionsInfo(guild) {
  if (!guild) {
    return undefined;
  }

  try {
    const botMember = guild.members.me ?? (await guild.members.fetchMe());

    return {
      roleNames: botMember.roles.cache
        .filter((role) => role.id !== guild.id) // @everyone 제외
        .sort((a, b) => b.position - a.position)
        .map((role) => role.name),
      permissionsText: formatPermissionsList(botMember.permissions),
    };
  } catch (error) {
    console.error("봇 권한 조회 중 오류:", error);
    return undefined;
  }
}

// 추가: 관리자 패널에서 확인할 채널별 핵심 권한 목록.
// 인증 채널에서 스레드 생성/메시지 전송이 막히는 문제를 진단하는 데 필요한 항목 위주로 구성.
const CHANNEL_KEY_PERMISSIONS = [
  "ViewChannel",
  "SendMessages",
  "SendMessagesInThreads",
  "CreatePublicThreads",
  "CreatePrivateThreads",
  "ReadMessageHistory",
  "EmbedLinks",
  "AttachFiles",
  "ManageThreads",
  "ManageMessages",
];

// 추가: 특정 채널에서 봇이 실제로 갖는 "유효 권한"(서버 역할 + 카테고리 + 채널 오버라이트가
// 모두 계산된 최종 결과)과, 그 채널에 걸린 오버라이트 중 봇과 관련된 것(봇이 가진 역할 /
// 봇 개별 계정 / @everyone)만 추려서 보여준다.
// 서버 전역 역할 권한이 아무리 높아도 채널 오버라이트가 거부(Deny)로 걸려 있으면 막히기
// 때문에, 이 채널 단위 정보가 "메시지 보내기/스레드 생성 실패" 문제 진단에 핵심이다.
async function getChannelPermissionInfo(channel) {
  if (!channel || !channel.guild) {
    return undefined;
  }

  try {
    const botMember = channel.guild.members.me ?? (await channel.guild.members.fetchMe());
    const effectivePermissions = channel.permissionsFor(botMember);

    const keyPermissionsText = CHANNEL_KEY_PERMISSIONS
      .map((permName) => {
        const has = effectivePermissions?.has(PermissionsBitField.Flags[permName]);
        const label = PERMISSION_LABELS_KO[permName] || permName;
        return `${has ? "✅" : "❌"} ${label}`;
      })
      .join("\n");

    const overwriteLines = [];
    const overwrites = channel.permissionOverwrites?.cache;

    if (overwrites) {
      const botRoleIds = new Set(botMember.roles.cache.keys());

      for (const overwrite of overwrites.values()) {
        const isEveryone = overwrite.id === channel.guild.id;
        const isBotRole = overwrite.type === OverwriteType.Role && botRoleIds.has(overwrite.id);
        const isBotMember = overwrite.type === OverwriteType.Member && overwrite.id === botMember.id;

        if (!isEveryone && !isBotRole && !isBotMember) {
          continue; // 봇과 무관한 다른 역할/멤버 오버라이트는 표시하지 않음
        }

        const allowNames = overwrite.allow.toArray().map((name) => PERMISSION_LABELS_KO[name] || name);
        const denyNames = overwrite.deny.toArray().map((name) => PERMISSION_LABELS_KO[name] || name);

        if (allowNames.length === 0 && denyNames.length === 0) {
          continue;
        }

        let label;
        if (isEveryone) {
          label = "@everyone";
        } else if (isBotRole) {
          const role = channel.guild.roles.cache.get(overwrite.id);
          label = `역할: ${role?.name || overwrite.id}`;
        } else {
          label = "봇 개별 오버라이트";
        }

        const parts = [];
        if (allowNames.length) parts.push(`✅ 허용: ${allowNames.join(", ")}`);
        if (denyNames.length) parts.push(`❌ 거부: ${denyNames.join(", ")}`);

        overwriteLines.push(`**${label}**\n${parts.join("\n")}`);
      }
    }

    return {
      keyPermissionsText: keyPermissionsText || "조회 불가",
      overwriteText: overwriteLines.length
        ? overwriteLines.join("\n\n")
        : "관련 오버라이트 없음 (상위 권한을 그대로 상속받는 중)",
    };
  } catch (error) {
    console.error("채널 권한 조회 중 오류:", error);
    return undefined;
  }
}

// 추가: 서버(길드) 단위 보안 설정을 사람이 읽기 쉬운 한국어로 변환한다.
// 특정 서버에서만 봇의 메시지 전송/스레드 생성이 막히는 경우, 채널 권한이 아니라
// 이 서버 전체의 보안 정책(인증 단계, 2FA 요구, 특수 서버 기능 등)이 원인일 수 있어
// 진단 목적으로 함께 보여준다.
const VERIFICATION_LEVEL_KO = {
  [GuildVerificationLevel.None]: "없음",
  [GuildVerificationLevel.Low]: "낮음 (이메일 인증 필요)",
  [GuildVerificationLevel.Medium]: "보통 (5분 이상 가입된 계정만)",
  [GuildVerificationLevel.High]: "높음 (10분 이상 멤버만)",
  [GuildVerificationLevel.VeryHigh]: "매우 높음 (전화번호 인증 필요)",
};

const EXPLICIT_CONTENT_FILTER_KO = {
  [GuildExplicitContentFilter.Disabled]: "사용 안 함",
  [GuildExplicitContentFilter.MembersWithoutRoles]: "역할 없는 멤버만 검사",
  [GuildExplicitContentFilter.AllMembers]: "모든 멤버 검사",
};

const MFA_LEVEL_KO = {
  [GuildMFALevel.None]: "요구하지 않음",
  [GuildMFALevel.Elevated]: "관리자 2단계 인증(2FA) 요구",
};

// 진단에 유용한 서버 기능(feature) 플래그만 선별해서 한국어 라벨로 매핑한다.
const RELEVANT_GUILD_FEATURES_KO = {
  COMMUNITY: "커뮤니티 서버",
  MEMBER_VERIFICATION_GATE_ENABLED: "멤버 스크리닝(가입 규칙 동의) 사용",
  PREVIEW_ENABLED: "서버 미리보기 사용",
  WELCOME_SCREEN_ENABLED: "환영 화면 사용",
  INVITES_DISABLED: "초대 링크 일시 중지됨",
};

async function getGuildSecurityInfo(guild) {
  if (!guild) {
    return undefined;
  }

  try {
    let botMember = guild.members.me ?? (await guild.members.fetchMe());
    const isBotTimedOut =
      typeof botMember.isCommunicationDisabled === "function"
        ? botMember.isCommunicationDisabled()
        : Boolean(botMember.communicationDisabledUntilTimestamp && botMember.communicationDisabledUntilTimestamp > Date.now());

    const relevantFeatures = guild.features
      .filter((feature) => RELEVANT_GUILD_FEATURES_KO[feature])
      .map((feature) => RELEVANT_GUILD_FEATURES_KO[feature]);

    return {
      verificationLevelText: VERIFICATION_LEVEL_KO[guild.verificationLevel] || "알 수 없음",
      explicitContentFilterText: EXPLICIT_CONTENT_FILTER_KO[guild.explicitContentFilter] || "알 수 없음",
      mfaLevelText: MFA_LEVEL_KO[guild.mfaLevel] || "알 수 없음",
      isBotTimedOut,
      botTimeoutUntil: botMember.communicationDisabledUntilTimestamp,
      relevantFeaturesText: relevantFeatures.length ? relevantFeatures.join(", ") : "해당 없음",
    };
  } catch (error) {
    console.error("서버 보안 정보 조회 중 오류:", error);
    return undefined;
  }
}

async function getBotThreadsInfo(channel) {
  if (!channel || channel.isThread() || typeof channel.threads?.fetchActive !== "function") {
    return undefined;
  }

  const activeResult = await channel.threads.fetchActive().catch(() => undefined);
  const allThreads = [...(activeResult?.threads?.values() ?? [])];

  const botThreads = allThreads.filter((thread) => thread.ownerId === client.user.id);

  const now = Date.now();
  const staleThreads = [];

  for (const thread of botThreads) {
    const lastActivityTimestamp = await getThreadLastActivityTimestamp(thread);
    if (now - lastActivityTimestamp >= THREAD_INACTIVITY_TIMEOUT_MS) {
      staleThreads.push(thread);
    }
  }

  return {
    totalThreadCount: allThreads.length,
    botThreadCount: botThreads.length,
    staleThreads,
  };
}

async function createAdminPanel(channel) {
  const threadsInfo = await getBotThreadsInfo(channel).catch((error) => {
    console.error("스레드 정보 조회 중 오류:", error);
    return undefined;
  });

  // 추가: 봇 권한/역할 조회
  const permissionsInfo = await getBotPermissionsInfo(channel.guild).catch((error) => {
    console.error("봇 권한 정보 조회 중 오류:", error);
    return undefined;
  });

  // 추가: 현재 채널의 권한 상세 조회
  const channelPermissionInfo = await getChannelPermissionInfo(channel).catch((error) => {
    console.error("채널 권한 정보 조회 중 오류:", error);
    return undefined;
  });

  // 추가: 서버 단위 보안 설정 조회
  const guildSecurityInfo = await getGuildSecurityInfo(channel.guild).catch((error) => {
    console.error("서버 보안 정보 조회 중 오류:", error);
    return undefined;
  });

  const embed = new EmbedBuilder()
    .setTitle("마스터 컨트롤 패널")
    .setDescription("소영 봇의 현재 작동 상태입니다.")
    .setColor(0x2f80ed)
    .addFields(
      { name: "패널 사용자", value: `<@${ADMIN_USER_ID}>`, inline: true },
      { name: "작동 서버", value: config.allowedGuildId || "전체 서버", inline: true },
      { name: "작동 채널", value: "명령어를 실행한 채널", inline: true },
      { name: "무응답 안내", value: isIdleMessageEnabled() ? formatDuration(config.idleTimeoutMs) : "꺼짐", inline: true },
      { name: "자동 답장 쿨다운", value: formatDuration(config.replyCooldownMs), inline: true },
      { name: "등록 규칙", value: `${rules.length}개`, inline: true },
      { name: "채널 내 전체 스레드 수", value: threadsInfo ? `${threadsInfo.totalThreadCount}개` : "조회 불가 (스레드 채널 등)", inline: true },
      { name: "소영이가 연 스레드 수", value: threadsInfo ? `${threadsInfo.botThreadCount}개` : "-", inline: true },
      { name: "6시간 이상 무활동 스레드", value: threadsInfo ? `${threadsInfo.staleThreads.length}개` : "-", inline: true },
      // 추가된 필드
      {
        name: "봇이 가진 역할",
        value: permissionsInfo?.roleNames?.length
          ? truncateForEmbed(permissionsInfo.roleNames.join(", "))
          : "역할 없음 / 조회 불가",
        inline: false,
      },
      {
        name: "봇 권한",
        value: permissionsInfo
          ? truncateForEmbed(permissionsInfo.permissionsText)
          : "조회 불가",
        inline: false,
      },
      // 추가된 필드: 현재 채널 기준 유효 권한
      {
        name: `이 채널에서의 유효 권한 (#${channel.name ?? channel.id})`,
        value: channelPermissionInfo
          ? truncateForEmbed(channelPermissionInfo.keyPermissionsText)
          : "조회 불가",
        inline: false,
      },
      // 추가된 필드: 이 채널의 봇 관련 오버라이트
      {
        name: "이 채널의 권한 오버라이트 (봇 관련)",
        value: channelPermissionInfo
          ? truncateForEmbed(channelPermissionInfo.overwriteText)
          : "조회 불가",
        inline: false,
      },
      // 추가된 필드: 서버 보안 설정
      {
        name: "서버 인증 단계",
        value: guildSecurityInfo ? guildSecurityInfo.verificationLevelText : "조회 불가",
        inline: true,
      },
      {
        name: "유해 콘텐츠 필터",
        value: guildSecurityInfo ? guildSecurityInfo.explicitContentFilterText : "조회 불가",
        inline: true,
      },
      {
        name: "관리자 2단계 인증 요구",
        value: guildSecurityInfo ? guildSecurityInfo.mfaLevelText : "조회 불가",
        inline: true,
      },
      {
        name: "봇 타임아웃 여부",
        value: guildSecurityInfo
          ? guildSecurityInfo.isBotTimedOut
            ? `🔇 타임아웃 중 (해제: <t:${Math.floor((guildSecurityInfo.botTimeoutUntil ?? Date.now()) / 1000)}:R>)`
            : "정상"
          : "조회 불가",
        inline: true,
      },
      {
        name: "관련 서버 기능",
        value: guildSecurityInfo ? truncateForEmbed(guildSecurityInfo.relevantFeaturesText) : "조회 불가",
        inline: false,
      },
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("admin:compose")
      .setLabel("메시지 작성")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("admin:cleanup-stale-threads")
      .setLabel("무활동 스레드 정리")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!threadsInfo || threadsInfo.staleThreads.length === 0),
  );

  return {
    embeds: [embed],
    components: [row],
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
  const isCompletedForm = analysis.rule.name === "completed-form";

  const nickname = extractNicknameFromText(analysis.message.content);
  const robloxProfile = await fetchRobloxUserProfile(nickname);
  const profileEmbed = createRobloxProfileEmbed(nickname, robloxProfile);

  const replyOptions = {
    content: isMissingMention
      ? baseReply
      : formatReplyWithValidity(baseReply, isCompletedForm ? "`양식 유효`" : undefined, isCompletedForm),
    embeds: [profileEmbed],
    components: [createFaqSelectRow()],
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
} */

function stripLeadingEmoji(text) {
  return text.replace(/^[\s\u200B]*(?:(?:<a?:[\w\d_]+:\d+>)|[\p{Emoji_Presentation}\p{Extended_Pictographic}]|[:;][\-~]?[()DPpOo])+[\s\u200B]*/u, "");
}

function formatReplyWithValidity(baseReply, validityText, isValid) {
  const cleanedReply = stripLeadingEmoji(baseReply).trim();
  if (!validityText) {
    return `> ${cleanedReply}`;
  }

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

function createThreadCompleteEmbed(processor) {
  return new EmbedBuilder()
    .setTitle("요청 처리 완료")
    .setDescription("정상적으로 처리되었습니다. 해당 스레드를 잠금 후 닫아주세요.")
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
      flags: MessageFlags.Ephemeral,
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

// "무활동 스레드 정리" 버튼 처리.
// 현재 시점 기준으로 다시 무활동 스레드 목록을 조회한 뒤(버튼을 누르는 사이 상황이
// 바뀌었을 수 있으므로) 실제로 보관 처리하고, 메모리에 남아있던 타이머/추적 정보도 함께 정리한다.
async function handleCleanupStaleThreads(interaction) {
  await interaction.deferUpdate();

  const channel = interaction.channel;
  const threadsInfo = await getBotThreadsInfo(channel).catch((error) => {
    console.error("스레드 정보 조회 중 오류:", error);
    return undefined;
  });

  if (!threadsInfo || threadsInfo.staleThreads.length === 0) {
    const panel = await createAdminPanel(channel);
    await interaction.editReply(panel);
    await interaction.followUp({
      content: "정리할 무활동 스레드가 없습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let closedCount = 0;
  const failedThreadNames = [];

  for (const thread of threadsInfo.staleThreads) {
    try {
      if (!thread.archived) {
        await thread.setArchived(true);
      }
      closedCount += 1;
    } catch (error) {
      console.error(`스레드(${thread.id}) 정리 중 오류:`, error);
      failedThreadNames.push(thread.name || thread.id);
    } finally {
      clearThreadIdleTimer(thread);
      activeBotReplyThreads.delete(thread.id);
    }
  }

  const updatedPanel = await createAdminPanel(channel);
  await interaction.editReply(updatedPanel);

  const resultMessage = failedThreadNames.length
    ? `${closedCount}개 스레드를 정리했습니다. 실패: ${failedThreadNames.join(", ")}`
    : `${closedCount}개 스레드를 정리했습니다.`;

  await interaction.followUp({
    content: resultMessage,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleAdminInteraction(interaction) {
  if (!canUseAdminPanel(interaction)) {
    await interaction.reply({
      content: "이 명령어는 지정된 사용자만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.isChatInputCommand()) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const panel = await createAdminPanel(interaction.channel);
    await interaction.editReply(panel);
    return;
  }

  if (interaction.customId === "admin:compose") {
    await interaction.showModal(createAdminModal());
    return;
  }

  if (interaction.customId === "admin:cleanup-stale-threads") {
    await handleCleanupStaleThreads(interaction);
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

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === FAQ_SELECT_CUSTOM_ID) {
      await handleFaqSelectInteraction(interaction);
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
  // message.system: 스레드 생성 알림, 멤버 참여, 부스트, 핀 고정 알림 등
  // Discord가 자동 생성하는 시스템 메시지는 스레드 생성/답장(reply)이 애초에 불가능하므로
  // 인증 요청 분석 파이프라인에 들어가기 전에 여기서 먼저 걸러낸다.
  // (이걸 걸러내지 않으면 시스템 메시지 내용에 "닉네임"/"경로" 등 키워드가 우연히 포함될 경우
  //  인증 요청으로 오인되어 startThread()가 50001, message.reply()가 50035로 실패하게 된다.)
  if (message.author.bot || !message.guild || message.system) {
    return;
  }

  if (message.channel.isThread() && activeBotReplyThreads.has(message.channel.id) && isDirectorMember(message.member)) {
    if (isCloseKeyword(message.content)) {
      try {
        await reactToThreadStarterMessage(message.channel, message, "✅");
        await message.channel.send({ embeds: [createThreadCompleteEmbed(message.member)] });
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
    // scheduleThreadAutoClose가 내부적으로 기존 타이머를 정리(clearThreadIdleTimer)하고
    // 새로 예약하므로, 여기서 수동으로 다시 지울 필요는 없다.
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
