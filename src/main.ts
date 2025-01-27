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

function killProcess(name: string) {
  sendLog("log", `Attempting to kill process: ${name}`);
  if (os.platform() === "win32") {
    spawnSync("taskkill", ["/F", "/IM", name], { stdio: "ignore" });
  } else {
    spawnSync("pkill", [name], { stdio: "ignore" });
  }
  sendLog("log", `Process kill command executed for: ${name}`);
}

function killChromeDriverProcesses() {
  sendLog("log", "Killing any existing ChromeDriver processes...");
  killProcess("chromedriver.exe");
}

function readStartUrl() {
  try {
    const dataFile = path.join(__dirname, "start_url.txt");
    if (fs.existsSync(dataFile)) {
      const url = fs.readFileSync(dataFile, "utf8").trim();
      sendLog("log", `Read start URL from file: ${url}`);
      return url;
    }
  } catch (error) {
    sendLog("error", `Failed to read start URL: ${formatError(error)}`);
  }
  return "";
}

function writeStartUrl(url: string) {
  try {
    const dataFile = path.join(__dirname, "start_url.txt");
    fs.writeFileSync(dataFile, url, "utf8");
    sendLog("log", `Saved start URL to file: ${url}`);
  } catch (error) {
    sendLog("error", `Failed to save start URL: ${formatError(error)}`);
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

function getInstalledChromeVersion() {
  if (os.platform() === "win32") {
    try {
      // Try PowerShell first (more reliable)
      sendLog("log", "Attempting to get Chrome version using PowerShell...");
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
        sendLog("log", `Found Chrome version using PowerShell: ${version}`);
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

      sendLog("log", "Searching for Chrome in possible locations...");
      for (const chromePath of possiblePaths) {
        sendLog("log", `Checking path: ${chromePath}`);
        if (fs.existsSync(chromePath)) {
          sendLog("log", `Found Chrome executable at: ${chromePath}`);
          // Use PowerShell to get file version (more reliable than wmic)
          const psVerCmd = spawnSync(
            "powershell",
            ["-Command", `(Get-Item '${chromePath}').VersionInfo.FileVersion`],
            { encoding: "utf8" }
          );

          if (psVerCmd.status === 0 && psVerCmd.stdout.trim()) {
            const version = psVerCmd.stdout.trim();
            sendLog("log", `Found Chrome version using file info: ${version}`);
            return version;
          }
        }
      }

      // Fallback to registry queries
      sendLog("log", "Trying registry queries...");
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
          sendLog("log", `Querying registry: ${regPath}`);
          const reg = spawnSync("reg", ["query", regPath, "/v", key], {
            encoding: "utf8",
          });

          if (reg.status === 0 && reg.stdout) {
            const match = reg.stdout
              .trim()
              .match(/REG_SZ\s+(\d+\.\d+\.\d+\.\d+)/);
            if (match) {
              sendLog("log", `Found Chrome version in registry: ${match[1]}`);
              return match[1];
            }
          }
        } catch (e) {
          sendLog("log", `Failed to query registry path: ${regPath}`);
        }
      }

      sendLog(
        "error",
        "Failed to detect Chrome version using all available methods"
      );
    } catch (error: unknown) {
      if (error instanceof Error) {
        sendLog("error", `Failed to get Chrome version: ${formatError(error)}`);
      } else {
        sendLog("error", "Unknown error while detecting Chrome version");
      }
    }
  }
  return null;
}

function getMajorVersion(ver: string | null) {
  if (!ver) {
    sendLog("log", "No version provided to get major version");
    return null;
  }
  const major = ver.split(".")[0];
  sendLog("log", `Extracted major version ${major} from ${ver}`);
  return major;
}

function getDriverMajorVersion(driverPath: string) {
  sendLog("log", `Checking ChromeDriver version at: ${driverPath}`);
  if (!fs.existsSync(driverPath)) {
    sendLog("log", "ChromeDriver not found at specified path");
    return null;
  }
  try {
    const out = execFileSync(driverPath, ["--version"], {
      encoding: "utf8",
    }).trim();
    sendLog("log", `ChromeDriver version output: ${out}`);
    const m = out.match(/ChromeDriver\s+(\d+)\./) || out.match(/(\d+)\.[\d.]+/);
    if (m) {
      sendLog("log", `Detected ChromeDriver major version: ${m[1]}`);
      return m[1];
    }
    sendLog("log", "Could not parse ChromeDriver version from output");
  } catch (error) {
    sendLog(
      "error",
      `Failed to get ChromeDriver version: ${formatError(error)}`
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
      `Attempting to download ChromeDriver for Chrome version ${chromeMajorVersion}`
    );

    const url =
      "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";
    const response = await fetch(url);
    const json = (await response.json()) as ChromeVersions;
    sendLog("log", "Successfully fetched version data from Chrome Labs");

    // 모든 채널에서 일치하거나 가장 가까운 이전 버전 찾기
    let matchingVersion = null;
    let closestVersion = null;
    const targetMajor = parseInt(chromeMajorVersion);

    for (const [channel, data] of Object.entries(json.channels)) {
      const version = data.version;
      const major = parseInt(getMajorVersion(version) || "0");

      // 정확히 일치하는 버전 찾기
      if (major === targetMajor) {
        matchingVersion = data;
        sendLog(
          "log",
          `Found exact matching version in channel ${channel}: ${version}`
        );
        break;
      }

      // 가장 가까운 이전 버전 업데이트
      if (
        major < targetMajor &&
        (!closestVersion ||
          major > parseInt(getMajorVersion(closestVersion.version) || "0"))
      ) {
        closestVersion = data;
      }
    }

    // 일치하는 버전이 없으면 가장 가까운 이전 버전 사용
    const selectedVersion = matchingVersion || closestVersion;
    if (!selectedVersion) {
      sendLog(
        "error",
        `No suitable ChromeDriver version found for Chrome ${chromeMajorVersion}`
      );
      return null;
    }

    if (!matchingVersion) {
      sendLog(
        "log",
        `Using closest available version: ${selectedVersion.version}`
      );
    }

    // 드라이버 URL 찾기
    const downloads = selectedVersion.downloads?.chromedriver || [];
    const driverUrl = downloads.find(
      (item: { platform: string; url: string }) => item.platform === "win64"
    )?.url;

    if (!driverUrl) {
      sendLog("error", "No suitable ChromeDriver download URL found");
      return null;
    }
    sendLog("log", `Found driver URL for win64: ${driverUrl}`);

    // 4. 드라이버 다운로드
    const zipPath = path.join(__dirname, "temp_driver.zip");
    const response2 = await fetch(driverUrl);
    const arrayBuffer = await response2.arrayBuffer();
    await fs.promises.writeFile(zipPath, Buffer.from(arrayBuffer));
    sendLog("log", `Downloaded ChromeDriver to ${zipPath}`);

    // 5. 압축 해제
    const driverDir = path.join(__dirname, "chromedriver");
    if (fs.existsSync(driverDir)) {
      sendLog("log", "Removing existing ChromeDriver directory");
      killProcess("chromedriver.exe");
      await fs.promises.rm(driverDir, { recursive: true, force: true });
    }

    sendLog("log", `Creating directory: ${driverDir}`);
    await fs.promises.mkdir(driverDir, { recursive: true });

    const zipData = await fs.promises.readFile(zipPath);
    const zip = new JSZip();
    await zip.loadAsync(zipData);
    let extracted = false;

    for (const [filename, file] of Object.entries(zip.files)) {
      if (filename.endsWith("chromedriver.exe")) {
        sendLog("log", `Extracting ${filename}`);
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
      sendLog("error", "ChromeDriver.exe not found in zip file");
      return null;
    }

    const driverPath = path.join(driverDir, "chromedriver.exe");
    sendLog("log", `ChromeDriver extracted to: ${driverPath}`);
    return driverPath;
  } catch (error) {
    sendLog(
      "error",
      `Error in downloadLatestChromedriver: ${formatError(error)}`
    );
    throw error;
  }
}

async function ensureChromedriver() {
  const chromeVer = getInstalledChromeVersion();
  sendLog("log", `Detected Chrome version: ${chromeVer}`);
  if (!chromeVer) return null;

  const chromeMajor = getMajorVersion(chromeVer);
  sendLog("log", `Chrome major version: ${chromeMajor}`);
  if (!chromeMajor) return null;

  const driverPath = path.join(__dirname, "chromedriver", "chromedriver.exe");
  const driverMajor = getDriverMajorVersion(driverPath);
  sendLog("log", `Current ChromeDriver version: ${driverMajor}`);

  if (!driverMajor || driverMajor !== chromeMajor) {
    sendLog("log", `Downloading new ChromeDriver for version: ${chromeMajor}`);
    try {
      const newDriver = await downloadLatestChromedriver(chromeMajor);
      sendLog("log", `Downloaded ChromeDriver path: ${newDriver}`);
      return newDriver;
    } catch (error) {
      sendLog(
        "error",
        `Failed to download ChromeDriver: ${formatError(error)}`
      );
      return null;
    }
  }
  return driverPath;
}

async function applyJsStateToAllTabs() {
  if (!driver) {
    sendLog("log", "No active browser session to apply JS state");
    return;
  }
  try {
    const handles = await driver.getAllWindowHandles();
    sendLog("log", `Applying JS state to ${handles.length} tabs...`);
    for (const h of handles) {
      sendLog("log", `Switching to tab: ${h}`);
      await driver.switchTo().window(h);
      await (driver as any).sendDevToolsCommand(
        "Emulation.setScriptExecutionDisabled",
        { value: jsDisabled }
      );
      sendLog("log", `JS ${jsDisabled ? "disabled" : "enabled"} for tab: ${h}`);
      await driver.navigate().refresh();
    }
    sendLog("log", "Successfully applied JS state to all tabs");
  } catch (error) {
    sendLog("error", `Failed to apply JS state: ${formatError(error)}`);
  }
}

async function monitorBrowser() {
  sendLog("log", "Starting browser monitoring...");
  while (monitoring && driver) {
    try {
      const currentHandles = new Set(await driver.getAllWindowHandles());
      const newHandles = [...currentHandles].filter(
        (x) => !existingHandles.has(x)
      );
      if (newHandles.length > 0) {
        sendLog("log", `Detected ${newHandles.length} new browser tabs`);
        for (const nh of newHandles) {
          sendLog("log", `Processing new tab: ${nh}`);
          await driver.switchTo().window(nh);
          await (driver as any).sendDevToolsCommand(
            "Emulation.setScriptExecutionDisabled",
            { value: jsDisabled }
          );
          await driver.navigate().refresh();
          existingHandles.add(nh);
          sendLog("log", `Successfully processed new tab: ${nh}`);
        }
      }
      await driver.getTitle();
    } catch (error) {
      sendLog("error", `Browser monitoring error: ${formatError(error)}`);
      await onBrowserClosed();
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  sendLog("log", "Browser monitoring stopped");
}

async function onBrowserClosed() {
  sendLog("log", "Handling browser closure...");
  monitoring = false;
  driver = null;
  existingHandles.clear();
  sendLog("log", "Browser session cleaned up");
}

async function closeDriver() {
  if (driver) {
    sendLog("log", "Closing browser session...");
    try {
      const currentUrl = await driver.getCurrentUrl();
      sendLog("log", `Saving current URL: ${currentUrl}`);
      writeStartUrl(currentUrl);
      await driver.quit();
      sendLog("log", "Browser session closed successfully");
    } catch (error) {
      sendLog("error", `Error closing browser: ${formatError(error)}`);
    }
    driver = null;
    monitoring = false;
  } else {
    sendLog("log", "No active browser session to close");
  }
}

/**
 * Electron 메인 윈도우 생성
 */
const createWindow = () => {
  sendLog("log", "Creating main application window...");

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

  // Wait for window to be ready before sending logs
  mainWindow.webContents.on("did-finish-load", () => {
    console.log("Window loaded, sending initial log...");
    sendLog("log", "Window initialization completed");
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
  return readStartUrl() || "about:blank";
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
  sendLog("log", "Starting application cleanup...");
  await closeDriver();
  killChromeDriverProcesses();
  sendLog("log", "Application cleanup completed");
}

async function launchBrowser(url: string) {
  if (driver) {
    sendLog("log", "Browser is already running");
    return;
  }

  sendLog("log", "Starting browser launch process...");

  // Check Chrome installation first
  const chromeVer = getInstalledChromeVersion();
  if (!chromeVer) {
    sendLog(
      "error",
      "Chrome is not installed or version could not be detected"
    );
    return;
  }
  sendLog("log", `Detected Chrome version: ${chromeVer}`);

  const driverPath = await ensureChromedriver();
  if (!driverPath || !fs.existsSync(driverPath)) {
    sendLog("error", `ChromeDriver preparation failed. Path: ${driverPath}`);
    sendLog("error", "Please make sure Chrome is installed and try again");
    return;
  }
  sendLog("log", `ChromeDriver ready at: ${driverPath}`);

  try {
    sendLog("log", "Initializing Chrome WebDriver...");
    const serviceBuilder = new chrome.ServiceBuilder(driverPath);
    const options = new chrome.Options();
    options.addArguments("--no-sandbox");
    options.addArguments("--disable-dev-shm-usage");

    driver = (await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(options)
      .setChromeService(serviceBuilder)
      .build()) as CustomWebDriver;

    sendLog("log", `Chrome WebDriver initialized, navigating to URL: ${url}`);
    await driver.get(url);
    existingHandles = new Set(await driver.getAllWindowHandles());
    writeStartUrl(url);
    monitoring = true;
    monitorBrowser();

    if (jsDisabled) {
      await applyJsStateToAllTabs();
    }
    sendLog("log", "Browser launch completed successfully");
  } catch (e) {
    sendLog("error", `Browser launch error: ${formatError(e)}`);
    if (driver) {
      try {
        await driver.quit();
      } catch (error) {
        sendLog("error", `Error while quitting driver: ${formatError(error)}`);
      }
      driver = null;
    }
  }
}

async function toggleJs() {
  jsDisabled = !jsDisabled;
  sendLog("log", `Setting JavaScript ${jsDisabled ? "disabled" : "enabled"}`);
  if (driver) {
    try {
      await applyJsStateToAllTabs();
      sendLog("log", "Successfully toggled JavaScript state");
    } catch (e) {
      sendLog("error", `Failed to toggle JavaScript: ${formatError(e)}`);
    }
  } else {
    sendLog("log", "No active browser session to toggle JavaScript");
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

// 앱 시작 시점 수정
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
