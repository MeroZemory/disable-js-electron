// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from "electron";

// Electron API 타입 정의
export interface ElectronAPI {
  getStartUrl(): Promise<string>;
  saveStartUrl(url: string): Promise<void>;
  launchBrowser(url: string): Promise<void>;
  toggleJs(): Promise<boolean>;
  closeDriver(): Promise<void>;
  quitApp(): Promise<void>;
  onBrowserLog(
    callback: (log: { type: "log" | "error"; message: string }) => void
  ): () => void;
  onBrowserStateChanged(callback: (isRunning: boolean) => void): () => void;
}

// IPC 이벤트 리스너 설정
const logListeners = new Set<(log: any) => void>();
const stateListeners = new Set<(state: boolean) => void>();

ipcRenderer.on("browser-log", (_, log) => {
  console.log("Received browser log:", log);
  logListeners.forEach((callback) => callback(log));
});

ipcRenderer.on("browser-state-changed", (_, state) => {
  console.log("Received browser state:", state);
  stateListeners.forEach((callback) => callback(state));
});

// Electron API 노출
const api: ElectronAPI = {
  getStartUrl: () => ipcRenderer.invoke("getStartUrl"),
  saveStartUrl: (url) => ipcRenderer.invoke("saveStartUrl", url),
  launchBrowser: (url) => ipcRenderer.invoke("launchBrowser", url),
  toggleJs: () => ipcRenderer.invoke("toggleJs"),
  closeDriver: () => ipcRenderer.invoke("closeDriver"),
  quitApp: () => ipcRenderer.invoke("quitApp"),
  onBrowserLog: (callback) => {
    console.log("Registering browser log callback");
    logListeners.add(callback);
    return () => {
      console.log("Removing browser log callback");
      logListeners.delete(callback);
    };
  },
  onBrowserStateChanged: (callback) => {
    console.log("Registering browser state callback");
    stateListeners.add(callback);
    return () => {
      console.log("Removing browser state callback");
      stateListeners.delete(callback);
    };
  },
};

// Electron API를 `window.electronAPI`에 노출
contextBridge.exposeInMainWorld("electronAPI", api);
