/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/application-architecture#main-and-renderer-processes
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.ts` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */
import "./index.css";
import { ElectronAPI } from "./preload"; // preload.ts에서 타입을 가져옵니다.

// Window 객체에 electronAPI가 존재함을 명시
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// 컨테이너 생성
const container = document.createElement("div");
container.className = "container";

// URL 입력
const startUrlInput = document.createElement("input");
startUrlInput.type = "text";
startUrlInput.className = "url-input";
startUrlInput.placeholder = "URL을 입력하세요 (예: www.naver.com)";

// Enter 키로 브라우저 실행
startUrlInput.addEventListener("keypress", async (e) => {
  if (e.key === "Enter" && !launchButton.disabled) {
    launchButton.click();
  }
});

// 버튼 그룹
const buttonGroup = document.createElement("div");
buttonGroup.className = "button-group";

const launchButton = document.createElement("button");
launchButton.textContent = "브라우저 실행";
launchButton.title = "새 브라우저 창을 실행합니다 (Enter)";

const toggleJsButton = document.createElement("button");
toggleJsButton.textContent = "JS 토글";
toggleJsButton.className = "secondary";
toggleJsButton.title = "JavaScript 실행을 켜거나 끕니다 (Alt + J)";

const closeDriverButton = document.createElement("button");
closeDriverButton.textContent = "브라우저 종료";
closeDriverButton.className = "secondary";
closeDriverButton.title = "실행 중인 브라우저를 종료합니다 (Alt + Q)";

const quitButton = document.createElement("button");
quitButton.textContent = "앱 종료";
quitButton.className = "danger";
quitButton.title = "프로그램을 종료합니다 (Alt + X)";

// 정보 표시 영역
const infoDiv = document.createElement("div");
infoDiv.className = "info";
infoDiv.textContent =
  "URL을 입력하고 Enter 키를 누르거나 브라우저 실행 버튼을 클릭하세요.";

// 로그 컨테이너
const logDiv = document.createElement("div");
logDiv.className = "log-container";

// 로그 메모리 저장소
let allLogs: { type: string; message: string }[] = [];

// 로그 컨트롤 영역
const logControl = document.createElement("div");
logControl.className = "log-control";

// 로그 내용을 담을 컨테이너
const logContent = document.createElement("div");
logContent.className = "log-content";
logDiv.appendChild(logContent);

// 로그 카운터 표시
const logCounter = document.createElement("span");
logCounter.className = "log-counter";
logControl.appendChild(logCounter);

const clearLogButton = document.createElement("button");
clearLogButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 6h18"></path>
  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
</svg>`;
clearLogButton.className = "secondary icon-only";
clearLogButton.title = "로그 내용을 모두 지웁니다 (Alt + L)";

const copyLogButton = document.createElement("button");
copyLogButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
</svg>`;
copyLogButton.className = "secondary icon-only";
copyLogButton.title = "로그 내용을 클립보드에 복사합니다 (Alt + C)";

// 로그 컨트롤 버튼 상태 업데이트
function updateLogControlButtons() {
  const hasLogs = allLogs.length > 0;
  clearLogButton.disabled = !hasLogs;
  copyLogButton.disabled = !hasLogs;

  // 로그 카운터 업데이트
  if (allLogs.length > MAX_LOG_DISPLAY) {
    logCounter.textContent = `${allLogs.length}개 (최근 ${MAX_LOG_DISPLAY}개만 표시)`;
  } else if (allLogs.length > 0) {
    logCounter.textContent = `${allLogs.length}개`;
  } else {
    logCounter.textContent = "로그 없음";
  }
}

const MAX_LOG_DISPLAY = 100;

clearLogButton.addEventListener("click", () => {
  logContent.innerHTML = "";
  allLogs = [];
  infoDiv.textContent = "로그가 초기화되었습니다.";
  updateLogControlButtons();
});

copyLogButton.addEventListener("click", async () => {
  const logText = allLogs.map((log) => log.message).join("\n");

  if (!logText.trim()) {
    infoDiv.textContent = "복사할 로그가 없습니다.";
    return;
  }

  try {
    await navigator.clipboard.writeText(logText);
    infoDiv.textContent = "로그가 클립보드에 복사되었습니다.";
  } catch (error) {
    infoDiv.textContent = "로그 복사에 실패했습니다.";
  }
});

// 단축키 설정
document.addEventListener("keydown", (e) => {
  if (e.altKey) {
    switch (e.key.toLowerCase()) {
      case "j":
        if (!toggleJsButton.disabled) {
          toggleJsButton.click();
        }
        break;
      case "q":
        if (!closeDriverButton.disabled) {
          closeDriverButton.click();
        }
        break;
      case "x":
        quitButton.click();
        break;
      case "l":
        clearLogButton.click();
        break;
      case "c":
        copyLogButton.click();
        break;
    }
  }
});

// 브라우저 상태에 따른 버튼 활성화/비활성화 처리
function updateButtonStates(isRunning: boolean) {
  launchButton.disabled = isRunning;
  closeDriverButton.disabled = !isRunning;
  startUrlInput.disabled = isRunning;
}

// JS 토글 버튼 상태 업데이트
function updateJsToggleState(isDisabled: boolean) {
  toggleJsButton.textContent = `JS ${isDisabled ? "활성화" : "비활성화"}`;
  infoDiv.textContent = `현재 JavaScript가 ${
    isDisabled ? "비활성화" : "활성화"
  } 되어 있습니다.`;
}

// 초기화
async function init() {
  console.log("Initializing renderer process...");
  console.log("electronAPI available:", !!window.electronAPI);

  // 저장된 URL 로드
  const savedUrl = await window.electronAPI.getStartUrl();
  if (savedUrl && savedUrl !== "about:blank") {
    startUrlInput.value = savedUrl;
    startUrlInput.select(); // URL 자동 선택
  }
  startUrlInput.focus(); // 입력 필드에 포커스

  // 브라우저 상태 변경 감지
  if (
    window.electronAPI &&
    typeof window.electronAPI.onBrowserStateChanged === "function"
  ) {
    console.log("Setting up browser state listener...");
    window.electronAPI.onBrowserStateChanged((isRunning) => {
      updateButtonStates(isRunning);
    });
  }

  // JS 상태 변경 감지
  if (
    window.electronAPI &&
    typeof window.electronAPI.onJsStateChanged === "function"
  ) {
    console.log("Setting up JS state listener...");
    window.electronAPI.onJsStateChanged((isDisabled) => {
      updateJsToggleState(isDisabled);
    });
  }

  // 브라우저 로그 수신
  if (
    window.electronAPI &&
    typeof window.electronAPI.onBrowserLog === "function"
  ) {
    console.log("Setting up browser log listener...");
    const unsubscribe = window.electronAPI.onBrowserLog((log) => {
      // 메모리에 모든 로그 저장
      allLogs.push(log);

      // 화면에는 최근 MAX_LOG_DISPLAY개만 표시
      const logEntry = document.createElement("div");
      logEntry.className = log.type === "error" ? "error" : "";
      logEntry.textContent = log.message;

      // 현재 스크롤 위치 확인
      const isScrolledToBottom =
        logContent.scrollHeight - logContent.clientHeight <=
        logContent.scrollTop + 1;

      // 표시된 로그가 MAX_LOG_DISPLAY개를 초과하면 가장 오래된 것 제거
      if (logContent.children.length >= MAX_LOG_DISPLAY) {
        const firstChild = logContent.children[0];
        logContent.removeChild(firstChild);
      }

      logContent.appendChild(logEntry);

      // 이전에 스크롤이 맨 아래에 있었을 때만 자동 스크롤
      if (isScrolledToBottom) {
        logContent.scrollTop = logContent.scrollHeight;
      }

      updateLogControlButtons();
    });

    // 페이지 언로드 시 구독 해제
    window.addEventListener("unload", unsubscribe);
  } else {
    console.error("Browser log API not available");
    const logEntry = document.createElement("div");
    logEntry.className = "error";
    logEntry.textContent = "Error: Browser log API not available";
    logContent.appendChild(logEntry);
    allLogs.push({
      type: "error",
      message: "Error: Browser log API not available",
    });
    updateLogControlButtons();
  }

  // 초기 버튼 상태 설정
  updateButtonStates(false);
  updateJsToggleState(false);
  updateLogControlButtons();
}

launchButton.addEventListener("click", async () => {
  const url = startUrlInput.value.trim();
  if (!url) {
    infoDiv.textContent = "URL을 입력해주세요.";
    startUrlInput.focus();
    return;
  }
  await window.electronAPI.launchBrowser(url);
});

toggleJsButton.addEventListener("click", async () => {
  const newState = await window.electronAPI.toggleJs();
  updateJsToggleState(newState);
});

closeDriverButton.addEventListener("click", async () => {
  await window.electronAPI.closeDriver();
  infoDiv.textContent = "브라우저가 종료되었습니다.";
  startUrlInput.focus();
});

quitButton.addEventListener("click", async () => {
  await window.electronAPI.quitApp();
});

// 요소들을 컨테이너에 추가
container.appendChild(startUrlInput);
buttonGroup.appendChild(launchButton);
buttonGroup.appendChild(toggleJsButton);
buttonGroup.appendChild(closeDriverButton);
buttonGroup.appendChild(quitButton);
container.appendChild(buttonGroup);
container.appendChild(infoDiv);
container.appendChild(logDiv);
logDiv.appendChild(logControl);
logDiv.appendChild(logContent);
logControl.appendChild(logCounter);
logControl.appendChild(copyLogButton);
logControl.appendChild(clearLogButton);

// 컨테이너를 body에 추가
document.body.appendChild(container);

init();

console.log("👋 renderer.ts: Electron 렌더러 프로세스에서 실행 중");
