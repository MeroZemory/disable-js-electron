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

const startUrlInput = document.createElement("input");
startUrlInput.type = "text";
startUrlInput.style.width = "300px";
startUrlInput.placeholder = "시작 URL";

const launchButton = document.createElement("button");
launchButton.textContent = "브라우저 실행";

const toggleJsButton = document.createElement("button");
toggleJsButton.textContent = "JS 토글";

const closeDriverButton = document.createElement("button");
closeDriverButton.textContent = "브라우저 종료";

const quitButton = document.createElement("button");
quitButton.textContent = "앱 종료";

const infoDiv = document.createElement("div");
infoDiv.style.marginTop = "1rem";

const logDiv = document.createElement("div");
logDiv.style.marginTop = "1rem";
logDiv.style.padding = "1rem";
logDiv.style.backgroundColor = "#f5f5f5";
logDiv.style.border = "1px solid #ddd";
logDiv.style.borderRadius = "4px";
logDiv.style.fontFamily = "monospace";
logDiv.style.whiteSpace = "pre-wrap";
logDiv.style.maxHeight = "300px";
logDiv.style.overflowY = "auto";

// 초기화
async function init() {
  console.log("Initializing renderer process...");
  console.log("electronAPI available:", !!window.electronAPI);

  // 저장된 URL 로드
  const savedUrl = await window.electronAPI.getStartUrl();
  if (savedUrl) {
    startUrlInput.value = savedUrl;
  }

  // 브라우저 로그 수신
  if (
    window.electronAPI &&
    typeof window.electronAPI.onBrowserLog === "function"
  ) {
    console.log("Setting up browser log listener...");
    const unsubscribe = window.electronAPI.onBrowserLog((log) => {
      const logEntry = document.createElement("div");
      logEntry.style.color = log.type === "error" ? "red" : "black";
      logEntry.textContent = log.message;
      logDiv.appendChild(logEntry);

      // 새 로그가 추가될 때마다 스크롤을 맨 아래로 이동
      logDiv.scrollTop = logDiv.scrollHeight;
    });

    // 페이지 언로드 시 구독 해제
    window.addEventListener("unload", unsubscribe);
  } else {
    console.error("Browser log API not available");
    const logEntry = document.createElement("div");
    logEntry.style.color = "red";
    logEntry.textContent = "Error: Browser log API not available";
    logDiv.appendChild(logEntry);
  }
}

launchButton.addEventListener("click", async () => {
  const url = startUrlInput.value.trim();
  await window.electronAPI.saveStartUrl(url);
  await window.electronAPI.launchBrowser(url);
  infoDiv.textContent = `브라우저를 실행했습니다: ${url}`;
});

toggleJsButton.addEventListener("click", async () => {
  const newState = await window.electronAPI.toggleJs();
  infoDiv.textContent = `JS 상태: ${newState ? "비활성화" : "활성화"}`;
});

closeDriverButton.addEventListener("click", async () => {
  await window.electronAPI.closeDriver();
  infoDiv.textContent = "브라우저를 종료했습니다.";
});

quitButton.addEventListener("click", async () => {
  await window.electronAPI.quitApp();
});

document.body.appendChild(startUrlInput);
document.body.appendChild(document.createElement("br"));
document.body.appendChild(document.createElement("br"));
document.body.appendChild(launchButton);
document.body.appendChild(toggleJsButton);
document.body.appendChild(closeDriverButton);
document.body.appendChild(quitButton);
document.body.appendChild(document.createElement("br"));
document.body.appendChild(infoDiv);
document.body.appendChild(document.createElement("br"));
document.body.appendChild(logDiv);

init();

console.log("👋 renderer.ts: Electron 렌더러 프로세스에서 실행 중");
