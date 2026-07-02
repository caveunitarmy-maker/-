# 소영 디스코드 채널 분석 봇

현재 채널의 최근 채팅 내용을 읽고, 키워드 흐름에 맞는 정해진 문장만 보내는 Discord 봇입니다.

## 준비

1. Discord Developer Portal에서 봇을 만듭니다.
2. Bot 설정에서 `MESSAGE CONTENT INTENT`를 켭니다.
3. 봇 초대 권한에 `View Channel`, `Read Message History`, `Send Messages`를 포함합니다.
4. `.env.example`을 복사해서 `.env` 파일을 만들고 `DISCORD_TOKEN`에 봇 토큰을 넣습니다.

`ALLOWED_GUILD_ID`에는 봇이 작동할 서버 ID를 넣습니다. 현재 설정은 `1477686598647808130`입니다.
`ALLOWED_CHANNEL_ID`에는 봇이 작동할 채널 ID를 넣습니다. 현재 설정은 `1520743922719129610`입니다.

## 실행

```bash
npm install
npm start
```

이 PC에서 `node` 명령이 안 잡히면 `run-bot.bat`을 실행하거나, VS Code에서 `F5`를 눌러 `Run Discord Bot` 설정으로 실행하면 됩니다.

## 답변 수정

`src/index.js`의 `rules` 배열에서 `keywords`와 `replies`를 바꾸면 됩니다.

예:

```js
{
  name: "hungry",
  keywords: ["배고파", "밥", "야식"],
  replies: ["밥부터 먹자.", "지금은 야식 각이야."]
}
```

이 봇은 사용자 계정이 아니라 공식 봇 계정으로만 동작합니다.
