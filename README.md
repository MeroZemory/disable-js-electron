# JavaScript 비활성화 브라우저 제어기

웹사이트의 JavaScript를 비활성화한 상태로 브라우저를 실행하고 제어할 수 있는 Electron 기반 애플리케이션입니다.

## 주요 기능

- 웹사이트 JavaScript 활성화/비활성화 토글
- 브라우저 실행 및 종료 제어
- 실시간 브라우저 로그 모니터링
- 로그 복사 및 초기화
- 키보드 단축키 지원

## 단축키

- `Enter`: 브라우저 실행
- `Alt + J`: JavaScript 토글
- `Alt + Q`: 브라우저 종료
- `Alt + X`: 앱 종료
- `Alt + L`: 로그 초기화
- `Alt + C`: 로그 복사

## 실행 방법

1. VS Code (또는 Cursor AI) 실행
2. 터미널 실행(Ctrl + `)
3. 워크스페이스 루트 경로로 이동
4. nodejs 종속성 설치 (터미널에서 `npm install` 명령어 실행)
5. `Debug App` 디버그 구성 선택 후 실행(F5)

## 시스템 요구사항

- Node.js 18.0.0 이상
- Chrome 브라우저 설치
- Windows, macOS, 또는 Linux 운영체제

## 개발 환경 설정

```bash
# 저장소 복제
git clone [repository-url]

# 종속성 설치
npm install

# 개발 모드 실행
npm start

# 애플리케이션 빌드
npm run make
```

## 라이선스

MIT License
