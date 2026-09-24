# 알고 보면 다 좋은 말이여

명절 잔소리를 어르신의 담백한 덕담으로 바꾸는 단방향 번역기입니다.

- 화면: GitHub Pages — https://meoyaho.github.io/jansori/
- API: Firebase Functions — `jansori-28924`, 서울(`asia-northeast3`)
- 모델: OpenAI `gpt-5-nano` (Responses API)
- 프롬프트: `functions/prompt.mjs`

Firebase Hosting, Firestore, 클라이언트 Firebase SDK 및 Analytics는 사용하지 않습니다.

## 로컬 실행

Node.js 20.20 이상 또는 22.12 이상을 권장합니다.

1. `.env.example`을 `.env`로 복사하고 `OPENAI_API_KEY=` 뒤에 키를 입력합니다.
2. `npm run dev`를 실행하고 http://localhost:3000 에서 이용합니다.
3. 포트를 바꾸려면 `npm run dev -- --port 3017`을 실행합니다.

키를 변경하면 로컬 서버를 재시작해야 합니다. 로컬 화면은 `/api/translate`, 배포 화면은 Firebase Functions의 HTTPS 주소를 호출합니다. `.env`는 Git에서 제외됩니다.

## Firebase Functions 배포

프로젝트에 Blaze 결제 계정이 연결되어 있어야 합니다.

```sh
npm install --prefix functions
node scripts/set-openai-secret.mjs
npm run deploy:functions
```

`set-openai-secret.mjs`는 `.env`의 OpenAI 키를 표준 입력으로 Secret Manager에 전달합니다. 키를 화면에 출력하거나 임시 파일로 만들지 않습니다. 배포 서버는 Secret Manager의 `OPENAI_API_KEY`만 사용합니다.

함수 URL: `https://asia-northeast3-jansori-28924.cloudfunctions.net/translate`

허용된 브라우저 출처는 `https://meoyaho.github.io`입니다. CORS는 출처 단위여서 `/jansori/` 경로만 제한하는 기능은 아닙니다. 브라우저의 CORS 제한은 이용자 인증을 대신하지 않습니다.

## GitHub Pages 배포

저장소 Settings → Pages → Source를 **GitHub Actions**로 설정합니다.

`main`에 푸시하면 `.github/workflows/pages.yml`이 검사·테스트 후 화면을 배포합니다. `npm run build:pages`로 만들어지는 `.pages/`에는 `index.html`, `app.js`, `style.css`, `.nojekyll`만 포함됩니다. 서버 코드와 비밀 파일은 Pages에 올리지 않습니다.

화면 변경은 GitHub 푸시로 자동 배포되지만, 서버 및 프롬프트 변경은 `npm run deploy:functions`도 실행해야 반영됩니다. OpenAI 키를 GitHub Secrets에 등록할 필요는 없습니다.

## 동작과 사용량 제한

- 입력을 1.1초 멈추거나 Enter를 누르면 번역합니다. 한국어 조합 중에는 요청하지 않습니다.
- 음성은 브라우저 Web Speech API로 인식하고, 확정된 텍스트만 번역 API에 보냅니다. 읽어주기도 브라우저 기능입니다.
- 모델과 번역 방향은 서버에서 고정됩니다. 최소 추론, 짧은 출력, 최대 512 출력 토큰(추론 포함), `store: false`를 사용합니다.
- 입력 최대 300자, 프로세스당 새 API 요청 최대 30회/분, 동시 요청 최대 3개입니다. 자동 재시도는 없습니다.
- Firebase 함수는 256MiB, 소수 CPU, 대기 인스턴스 0개, 최대 인스턴스 1개, 인스턴스당 동시 실행 1개입니다. 실제 인스턴스 교체 시 요청 제한 카운터가 초기화되므로 이 설정은 총 지출 상한을 보장하지 않습니다.
- 서버는 결과 100개를 최대 10분간 메모리에 보관합니다. 같은 탭도 최근 결과를 재사용합니다.
- 입력 변경 시 대기 요청을 취소하고 오래된 응답을 버립니다. 취소 전 처리된 토큰에는 비용이 발생할 수 있습니다.
- 저장한 번역은 localStorage, 현재 탭의 기록은 sessionStorage에 보관합니다.
- 오류 발생 시 예시 문장으로 대체하지 않고 실패를 표시합니다.

## 검증

```sh
npm run check
npm test
npm run build:pages
```

테스트는 실제 OpenAI 호출 없이 모의 응답으로 입력 검증, 키 미설정, 비밀 파일 차단, 결과 재사용, 실패·시간 초과, GitHub Pages CORS 및 Firebase의 사전 처리된 요청 본문을 확인합니다.

## 공식 문서

- Firebase HTTP 함수: https://firebase.google.com/docs/functions/http-events
- Firebase 비밀 설정: https://firebase.google.com/docs/functions/config-env
- GitHub Pages Actions: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- OpenAI 요금: https://developers.openai.com/api/docs/pricing
