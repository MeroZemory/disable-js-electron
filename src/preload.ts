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
}

// IPC 이벤트 리스너 설정
const listeners = new Set<(log: any) => void>();

ipcRenderer.on("browser-log", (_, log) => {
  console.log("Received browser log:", log);
  listeners.forEach((callback) => callback(log));
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
    listeners.add(callback);
    return () => {
      console.log("Removing browser log callback");
      listeners.delete(callback);
    };
  },
};

// Electron API를 `window.electronAPI`에 노출
contextBridge.exposeInMainWorld("electronAPI", api);
