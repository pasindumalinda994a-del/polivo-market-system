import { contextBridge, ipcRenderer } from "electron";

export type TerminalEnrollmentStatus = {
  installationId: string;
  hasCredential: boolean;
  pairingState: "idle" | "redeemed" | "waiting_host_confirm" | "paired" | "failed";
  stallDisplayName: string | null;
  hostDeviceId: string | null;
  deviceId: string | null;
  label: string | null;
};

/**
 * Narrow enrollment bridge only. No raw IPC, filesystem, or private keys exposed.
 */
contextBridge.exposeInMainWorld("polivoEnrollment", {
  getStatus: (): Promise<TerminalEnrollmentStatus> => ipcRenderer.invoke("enrollment:getStatus"),
  enrollTerminal: (input: {
    enrollmentSecret: string;
    enrollmentBaseUrl: string;
    deploymentEnvironment: "development" | "staging" | "production";
    hostServiceBaseUrl: string;
  }): Promise<TerminalEnrollmentStatus> => ipcRenderer.invoke("enrollment:enrollTerminal", input),
});
