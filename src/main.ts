import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { spawnSync, execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import { Builder, WebDriver } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome";
import JSZip = require("jszip");

let mainWindow: BrowserWindow | null = null;

/**
 * Selenium 관련
 */
interface CustomWebDriver extends WebDriver {
  sendDevToolsCommand(command: string, params?: object): Promise<void>;
}

let driver: CustomWebDriver | null = null;
let jsDisabled = false;
let existingHandles = new Set();
let monitoring = false;

function sendBrowserState(state: boolean) {
  if (mainWindow) {
    mainWindow.webContents.send("browser-state-changed", state);
  }
}

function sendJsState(state: boolean) {
  if (mainWindow) {
    mainWindow.webContents.send("js-state-changed", state);
  }
}

function killProcess(name: string) {
  sendLog("log", `프로세스 종료 시도 중: ${name}`);
  if (os.platform() === "win32") {
    spawnSync("taskkill", ["/F", "/IM", name], { stdio: "ignore" });
  } else {
    spawnSync("pkill", [name], { stdio: "ignore" });
  }
  sendLog("log", `프로세스 종료 명령 실행됨: ${name}`);
}

function killChromeDriverProcesses() {
  sendLog("log", "기존 ChromeDriver 프로세스를 종료합니다...");
  killProcess("chromedriver.exe");
}

function readStartUrl(defaultUrl = "about:blank") {
  try {
    const dataFile = path.join(
      app.getPath("userData"),
      "disable-js-electron",
      "start_url.txt"
    );
    if (fs.existsSync(dataFile)) {
      const url = fs.readFileSync(dataFile, "utf8").trim();
      sendLog("log", `파일에서 시작 URL을 읽어왔습니다: ${url}`);
      return url;
    }
    sendLog("log", `파일이 존재하지 않습니다: ${dataFile}`);
  } catch (error) {
    sendLog(
      "error",
      `시작 URL을 읽어오는 데 실패했습니다: ${formatError(error)}`
    );
  }
  return defaultUrl;
}

function writeStartUrl(url: string) {
  try {
    const dataFile = path.join(
      app.getPath("userData"),
      "disable-js-electron",
      "start_url.txt"
    );

    // 폴더 생성
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });

    fs.writeFileSync(dataFile, url, "utf8");
    sendLog("log", `파일에 시작 URL을 저장했습니다: ${url}`);
  } catch (error) {
    sendLog(
      "error",
      `시작 URL을 저장하는 데 실패했습니다: ${formatError(error)}`
    );
  }
}

function sendLog(type: "log" | "error", message: string) {
  if (mainWindow) {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} - ${message}`;

    mainWindow.webContents.send("browser-log", { type, message: logMessage });
  }

  if (type === "log") {
    console.log(message);
  } else {
    console.error(message);
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function normalizeUrl(url: string): string {
  url = url.trim();
  if (!url.match(/^[a-zA-Z]+:\/\//)) {
    return `https://${url}`;
  }
  return url;
}

function getInstalledChromeVersion() {
  if (os.platform() === "win32") {
    try {
      // Try PowerShell first (more reliable)
      sendLog(
        "log",
        "PowerShell을 사용하여 Chrome 버전을 확인하려고 시도 중입니다..."
      );
      const psCmd = spawnSync(
        "powershell",
        [
          "-Command",
          "Get-ItemProperty 'HKLM:\\SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Google Chrome' | Select-Object -ExpandProperty Version",
        ],
        { encoding: "utf8" }
      );

      if (psCmd.status === 0 && psCmd.stdout.trim()) {
        const version = psCmd.stdout.trim();
        sendLog(
          "log",
          `PowerShell을 통해 Chrome 버전을 찾았습니다: ${version}`
        );
        return version;
      }

      // Check multiple possible Chrome installation paths
      const possiblePaths = [
        path.join(
          process.env["LOCALAPPDATA"] || "",
          "Google/Chrome/Application/chrome.exe"
        ),
        path.join(
          process.env["PROGRAMFILES"] || "",
          "Google/Chrome/Application/chrome.exe"
        ),
        path.join(
          process.env["PROGRAMFILES(X86)"] || "",
          "Google/Chrome/Application/chrome.exe"
        ),
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      ];

      sendLog("log", "Chrome이 설치되어 있을 수 있는 위치를 검색 중입니다...");
      for (const chromePath of possiblePaths) {
        sendLog("log", `경로 확인 중: ${chromePath}`);
        if (fs.existsSync(chromePath)) {
          sendLog("log", `Chrome 실행 파일을 발견했습니다: ${chromePath}`);
          // Use PowerShell to get file version
          const psVerCmd = spawnSync(
            "powershell",
            ["-Command", `(Get-Item '${chromePath}').VersionInfo.FileVersion`],
            { encoding: "utf8" }
          );

          if (psVerCmd.status === 0 && psVerCmd.stdout.trim()) {
            const version = psVerCmd.stdout.trim();
            sendLog(
              "log",
              `파일 정보를 통해 Chrome 버전을 찾았습니다: ${version}`
            );
            return version;
          }
        }
      }

      // Fallback to registry queries
      sendLog("log", "레지스트리를 조회해 보겠습니다...");
      const registryPaths = [
        ["HKEY_CURRENT_USER\\Software\\Google\\Chrome\\BLBeacon", "version"],
        [
          "HKEY_LOCAL_MACHINE\\SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Google Chrome",
          "Version",
        ],
        [
          "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Google Chrome",
          "Version",
        ],
      ];

      for (const [regPath, key] of registryPaths) {
        try {
          sendLog("log", `레지스트리 확인 중: ${regPath}`);
          const reg = spawnSync("reg", ["query", regPath, "/v", key], {
            encoding: "utf8",
          });

          if (reg.status === 0 && reg.stdout) {
            const match = reg.stdout
              .trim()
              .match(/REG_SZ\s+(\d+\.\d+\.\d+\.\d+)/);
            if (match) {
              sendLog(
                "log",
                `레지스트리에서 Chrome 버전을 찾았습니다: ${match[1]}`
              );
              return match[1];
            }
          }
        } catch (e) {
          sendLog("log", `레지스트리 경로 조회에 실패했습니다: ${regPath}`);
        }
      }

      sendLog(
        "error",
        "모든 방법을 시도했으나 Chrome 버전을 확인할 수 없습니다."
      );
    } catch (error: unknown) {
      if (error instanceof Error) {
        sendLog(
          "error",
          `Chrome 버전을 가져오는 데 실패했습니다: ${formatError(error)}`
        );
      } else {
        sendLog(
          "error",
          "Chrome 버전을 확인하는 중 알 수 없는 오류가 발생했습니다."
        );
      }
    }
  }
  return null;
}

function getMajorVersion(ver: string | null) {
  if (!ver) {
    sendLog("log", "메이저 버전을 가져올 버전 정보가 없습니다.");
    return null;
  }
  const major = ver.split(".")[0];
  sendLog("log", `버전 문자열 ${ver}에서 메이저 버전 ${major}을 추출했습니다.`);
  return major;
}

function getDriverMajorVersion(driverPath: string) {
  sendLog("log", `ChromeDriver 버전을 확인합니다: ${driverPath}`);
  if (!fs.existsSync(driverPath)) {
    sendLog("log", "지정된 경로에서 ChromeDriver를 찾을 수 없습니다.");
    return null;
  }
  try {
    const out = execFileSync(driverPath, ["--version"], {
      encoding: "utf8",
    }).trim();
    sendLog("log", `ChromeDriver 버전 출력: ${out}`);
    const m = out.match(/ChromeDriver\s+(\d+)\./) || out.match(/(\d+)\.[\d.]+/);
    if (m) {
      sendLog("log", `ChromeDriver 메이저 버전을 확인했습니다: ${m[1]}`);
      return m[1];
    }
    sendLog("log", "ChromeDriver 버전을 출력에서 파싱할 수 없습니다.");
  } catch (error) {
    sendLog(
      "error",
      `ChromeDriver 버전을 가져오는 데 실패했습니다: ${formatError(error)}`
    );
  }
  return null;
}

async function downloadLatestChromedriver(
  chromeMajorVersion: string
): Promise<string | null> {
  try {
    sendLog(
      "log",
      `Chrome 버전 ${chromeMajorVersion}에 맞는 ChromeDriver를 다운로드합니다...`
    );

    const url =
      "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";
    const response = await fetch(url);
    const json = (await response.json()) as ChromeVersions;
    sendLog("log", "Chrome Labs에서 버전 정보를 성공적으로 가져왔습니다.");

    // "정확히" major 버전이 일치하는 채널이 있는지 확인
    let matchingVersion: ChromeVersion | null = null;
    const targetMajor = parseInt(chromeMajorVersion, 10);

    for (const [channel, data] of Object.entries(json.channels)) {
      const version = data.version;
      const major = parseInt(getMajorVersion(version) || "0", 10);

      // ① 정확히 일치하는 버전만 매칭
      if (major === targetMajor) {
        matchingVersion = data;
        sendLog(
          "log",
          `채널 "${channel}"에서 Chrome 버전과 정확히 일치하는 ChromeDriver를 찾았습니다: ${version}`
        );
        break;
      }
    }

    // ② 일치하는 버전이 전혀 없으면 에러 처리
    if (!matchingVersion) {
      sendLog(
        "error",
        `Chrome 메이저 버전 ${chromeMajorVersion}와 정확히 일치하는 ChromeDriver를 찾을 수 없습니다. ` +
          `Chrome을 업데이트하거나 지원되는 버전을 사용해 주세요.`
      );
      return null;
    }

    // ③ 해당 채널의 다운로드 URL을 가져옴
    const downloads = matchingVersion.downloads?.chromedriver || [];
    const driverUrl = downloads.find((item) => item.platform === "win64")?.url;

    if (!driverUrl) {
      sendLog(
        "error",
        "이 버전에 맞는 ChromeDriver 다운로드 URL을 찾을 수 없습니다."
      );
      return null;
    }
    sendLog(
      "log",
      `win64용 ChromeDriver 다운로드 경로를 찾았습니다: ${driverUrl}`
    );

    // zip 다운로드 → 압축 해제 → chromedriver.exe 추출
    const zipPath = path.join(__dirname, "temp_driver.zip");
    const response2 = await fetch(driverUrl);
    const arrayBuffer = await response2.arrayBuffer();
    await fs.promises.writeFile(zipPath, Buffer.from(arrayBuffer));
    sendLog("log", `ChromeDriver를 다운로드했습니다: ${zipPath}`);

    const driverDir = path.join(__dirname, "chromedriver");
    if (fs.existsSync(driverDir)) {
      sendLog("log", "기존 ChromeDriver 디렉터리를 삭제합니다.");
      killProcess("chromedriver.exe");
      await fs.promises.rm(driverDir, { recursive: true, force: true });
    }

    sendLog("log", `디렉터리를 생성합니다: ${driverDir}`);
    await fs.promises.mkdir(driverDir, { recursive: true });

    const zipData = await fs.promises.readFile(zipPath);
    const zip = new JSZip();
    await zip.loadAsync(zipData);
    let extracted = false;

    for (const [filename, file] of Object.entries(zip.files)) {
      if (filename.endsWith("chromedriver.exe")) {
        sendLog("log", `${filename} 파일을 압축 해제 중...`);
        const content = await file.async("nodebuffer");
        await fs.promises.writeFile(
          path.join(driverDir, "chromedriver.exe"),
          content
        );
        extracted = true;
      }
    }
    await fs.promises.unlink(zipPath);

    if (!extracted) {
      sendLog("error", "압축 파일에서 ChromeDriver.exe를 찾을 수 없습니다.");
      return null;
    }

    const driverPath = path.join(driverDir, "chromedriver.exe");
    sendLog("log", `ChromeDriver가 압축 해제되었습니다: ${driverPath}`);
    return driverPath;
  } catch (error) {
    sendLog(
      "error",
      `ChromeDriver 다운로드 중 오류 발생: ${formatError(error)}`
    );
    return null;
  }
}

async function ensureChromedriver() {
  const chromeVer = getInstalledChromeVersion();
  sendLog("log", `Chrome 버전을 확인했습니다: ${chromeVer}`);
  if (!chromeVer) return null;

  const chromeMajor = getMajorVersion(chromeVer);
  sendLog("log", `Chrome 메이저 버전: ${chromeMajor}`);
  if (!chromeMajor) return null;

  const driverPath = path.join(__dirname, "chromedriver", "chromedriver.exe");
  const driverMajor = getDriverMajorVersion(driverPath);
  sendLog("log", `현재 ChromeDriver 버전: ${driverMajor}`);

  if (!driverMajor || driverMajor !== chromeMajor) {
    sendLog(
      "log",
      `메이저 버전 ${chromeMajor}용 ChromeDriver를 새로 다운로드합니다...`
    );
    try {
      const newDriver = await downloadLatestChromedriver(chromeMajor);
      sendLog("log", `ChromeDriver가 다운로드되었습니다: ${newDriver}`);
      return newDriver;
    } catch (error) {
      sendLog(
        "error",
        `ChromeDriver 다운로드에 실패했습니다: ${formatError(error)}`
      );
      return null;
    }
  }
  return driverPath;
}

async function applyJsStateToAllTabs() {
  if (!driver) {
    sendLog("log", "JS 상태를 적용할 활성 브라우저 세션이 없습니다.");
    return;
  }
  try {
    const handles = await driver.getAllWindowHandles();
    sendLog("log", `JS 상태를 ${handles.length}개의 탭에 적용합니다...`);
    for (const h of handles) {
      await applyJsStateToTab(h);
    }
    sendLog("log", "모든 탭에 JS 상태 적용을 완료했습니다.");
  } catch (error) {
    sendLog(
      "error",
      `JS 상태를 적용하는 데 실패했습니다: ${formatError(error)}`
    );
  }
}

async function applyJsStateToTab(handle: string) {
  if (!driver) return;

  try {
    sendLog("log", `탭 전환 중: ${handle}`);
    await driver.switchTo().window(handle);
    await (driver as any).sendDevToolsCommand(
      "Emulation.setScriptExecutionDisabled",
      { value: jsDisabled }
    );
    sendLog(
      "log",
      `탭 ${handle}의 JS를 ${jsDisabled ? "비활성화" : "활성화"}했습니다.`
    );
    await driver.navigate().refresh();
  } catch (error) {
    sendLog(
      "error",
      `탭 ${handle}에 JS 상태를 적용하는 데 실패했습니다: ${formatError(error)}`
    );
  }
}

async function monitorBrowser() {
  sendLog("log", "브라우저 모니터링을 시작합니다...");
  while (monitoring && driver) {
    try {
      const currentHandles = new Set(await driver.getAllWindowHandles());
      const newHandles = [...currentHandles].filter(
        (x) => !existingHandles.has(x)
      );
      if (newHandles.length > 0) {
        sendLog(
          "log",
          `새로운 브라우저 탭이 ${newHandles.length}개 감지되었습니다.`
        );
        for (const nh of newHandles) {
          sendLog("log", `새로운 탭 처리 중: ${nh}`);
          await applyJsStateToTab(nh);
          existingHandles.add(nh);
          sendLog("log", `새로운 탭 ${nh} 처리를 완료했습니다.`);
        }
      }
      await driver.getTitle();
    } catch (error) {
      sendLog("error", `브라우저 모니터링 중 오류 발생: ${formatError(error)}`);
      await onBrowserClosed();
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  sendLog("log", "브라우저 모니터링이 중단되었습니다.");
}

async function onBrowserClosed() {
  sendLog("log", "브라우저가 닫힘에 따라 처리 중...");
  monitoring = false;
  driver = null;
  existingHandles.clear();
  sendBrowserState(false);
  sendLog("log", "브라우저 세션이 정리되었습니다.");
}

async function closeDriver() {
  if (driver) {
    sendLog("log", "브라우저 세션을 종료합니다...");
    try {
      await driver.quit();
      sendLog("log", "브라우저 세션이 정상적으로 종료되었습니다.");
    } catch (error) {
      sendLog(
        "error",
        `브라우저를 종료하는 중 오류 발생: ${formatError(error)}`
      );
    }
    driver = null;
    monitoring = false;
    sendBrowserState(false);
  } else {
    sendLog("log", "종료할 활성 브라우저 세션이 없습니다.");
  }
}

/**
 * Electron 메인 윈도우 생성
 */
const createWindow = () => {
  sendLog("log", "메인 애플리케이션 창을 생성합니다...");

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.setMenu(null);

  // Wait for window to be ready before sending logs
  mainWindow.webContents.on("did-finish-load", () => {
    console.log("Window loaded, sending initial log...");
    sendLog("log", "창 초기화가 완료되었습니다.");
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    console.log("Loading development server URL");
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools(); // 디버그 도구 열기
  } else {
    console.log("Loading production build");
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
};

/**
 * IPC 설정
 */
ipcMain.handle("getStartUrl", async () => {
  return readStartUrl("about:blank");
});

ipcMain.handle("saveStartUrl", async (event, url: string) => {
  writeStartUrl(url);
});

ipcMain.handle("launchBrowser", async (event, url: string) => {
  await launchBrowser(url);
});

ipcMain.handle("toggleJs", async () => {
  return await toggleJs();
});

ipcMain.handle("closeDriver", async () => {
  await closeDriver();
});

ipcMain.handle("quitApp", async () => {
  app.quit();
});

/**
 * 종료 시 처리
 */
async function cleanup() {
  sendLog("log", "애플리케이션 정리를 시작합니다...");
  await closeDriver();
  killChromeDriverProcesses();
  sendLog("log", "애플리케이션 정리가 완료되었습니다.");
}

async function launchBrowser(url: string) {
  if (driver) {
    sendLog("log", "브라우저가 이미 실행 중입니다.");
    return;
  }

  // URL 정규화
  url = normalizeUrl(url);

  sendBrowserState(true); // 브라우저 실행 시작을 알림
  sendLog("log", "브라우저 실행 프로세스를 시작합니다...");

  // Check Chrome installation first
  const chromeVer = getInstalledChromeVersion();
  if (!chromeVer) {
    sendLog("error", "Chrome이 설치되지 않았거나 버전을 확인할 수 없습니다.");
    sendBrowserState(false);
    return;
  }
  sendLog("log", `Chrome 버전을 확인했습니다: ${chromeVer}`);

  const driverPath = await ensureChromedriver();
  if (!driverPath || !fs.existsSync(driverPath)) {
    sendLog("error", `ChromeDriver 준비에 실패했습니다. 경로: ${driverPath}`);
    sendLog("error", "Chrome이 설치되어 있는지 확인하고 다시 시도해 주세요.");
    sendBrowserState(false);
    return;
  }
  sendLog("log", `ChromeDriver 준비 완료: ${driverPath}`);

  try {
    sendLog("log", "Chrome WebDriver를 초기화합니다...");
    const serviceBuilder = new chrome.ServiceBuilder(driverPath);
    const options = new chrome.Options();
    options.addArguments("--no-sandbox");
    options.addArguments("--disable-dev-shm-usage");

    driver = (await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(options)
      .setChromeService(serviceBuilder)
      .build()) as CustomWebDriver;

    sendLog(
      "log",
      `Chrome WebDriver가 초기화되었습니다. 다음 URL로 이동: ${url}`
    );
    await driver.get(url);
    existingHandles = new Set(await driver.getAllWindowHandles());

    // 브라우저 실행이 성공한 후에만 URL 저장
    writeStartUrl(url);

    monitoring = true;
    monitorBrowser();

    // 현재 JS 상태 적용
    if (jsDisabled) {
      await applyJsStateToAllTabs();
    }
    sendLog("log", "브라우저 실행이 성공적으로 완료되었습니다.");
  } catch (e) {
    sendLog("error", `브라우저 실행 중 오류 발생: ${formatError(e)}`);
    if (driver) {
      try {
        await driver.quit();
      } catch (error) {
        sendLog(
          "error",
          `드라이버를 종료하는 중 오류 발생: ${formatError(error)}`
        );
      }
      driver = null;
    }
    sendBrowserState(false);
  }
}

async function toggleJs() {
  jsDisabled = !jsDisabled;
  sendLog("log", `JavaScript를 ${jsDisabled ? "비활성화" : "활성화"}합니다.`);
  sendJsState(jsDisabled);

  if (driver) {
    try {
      await applyJsStateToAllTabs();
      sendLog("log", "JavaScript 상태를 성공적으로 전환했습니다.");
    } catch (e) {
      sendLog(
        "error",
        `JavaScript 상태를 전환하는 데 실패했습니다: ${formatError(e)}`
      );
    }
  } else {
    sendLog(
      "log",
      "현재 실행 중인 브라우저가 없습니다. 다음 브라우저 실행 시 적용됩니다."
    );
  }
  return jsDisabled;
}

// 앱 시작 전 필수 검증
async function validateEnvironment() {
  const chromeVer = getInstalledChromeVersion();
  if (!chromeVer) {
    console.error("Chrome is not installed or version could not be detected");
    app.exit(1);
    return;
  }

  try {
    await import("jszip");
  } catch (error) {
    console.error("Failed to load required dependencies:", error);
    app.exit(1);
    return;
  }
}

// 앱 시작 시점
app.whenReady().then(async () => {
  try {
    await validateEnvironment();
    createWindow();
  } catch (error) {
    console.error("Failed to start application:", error);
    app.exit(1);
  }
});

app.on("window-all-closed", async () => {
  await cleanup();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  await cleanup();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

interface ChromeVersion {
  version: string;
  downloads?: {
    chromedriver?: Array<{
      platform: string;
      url: string;
    }>;
  };
}

interface ChromeVersions {
  channels: {
    [key: string]: ChromeVersion;
  };
}
