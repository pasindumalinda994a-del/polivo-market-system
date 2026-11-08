import { contextBridge, ipcRenderer } from "electron";

export type TerminalEnrollmentStatus = {
  installationId: string;
  hasCredential: boolean;
  pairingState: "idle" | "redeemed" | "waiting_host_confirm" | "paired" | "failed";
  stallDisplayName: string | null;
  hostDeviceId: string | null;
  deviceId: string | null;
  label: string | null;
  hasHostTrustPins: boolean;
};

export type DesktopConnectionStatus = {
  state:
    | "unconfigured"
    | "unreachable"
    | "identity_failed"
    | "verified"
    | "signed_in"
    | "session_refresh_required"
    | "signed_out";
  pairedHostDeviceId: string | null;
  verifiedStallDisplayName: string | null;
  configuredHostLabel: string | null;
  lastSuccessfulCheckAt: string | null;
  lastErrorMessage: string | null;
  staffDisplayName: string | null;
  staffCode: string | null;
  capabilities: string[];
};

export type ConfigureHostResult = {
  ok: boolean;
  verifiedStallDisplayName: string | null;
  hostDeviceId: string | null;
  message: string;
};

/**
 * Narrow enrollment + connection bridges only.
 * No raw IPC, filesystem, private keys, or session secrets exposed.
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

contextBridge.exposeInMainWorld("polivoConnection", {
  getStatus: (): Promise<DesktopConnectionStatus> => ipcRenderer.invoke("connection:getStatus"),
  configureOrTestHost: (input: {
    hostAddress: string;
    port?: number;
  }): Promise<ConfigureHostResult> => ipcRenderer.invoke("connection:configureOrTestHost", input),
  signIn: (input: { staffCode: string; secret: string }): Promise<DesktopConnectionStatus> =>
    ipcRenderer.invoke("connection:signIn", input),
  getSession: (): Promise<DesktopConnectionStatus> => ipcRenderer.invoke("connection:getSession"),
  signOut: (): Promise<{
    status: DesktopConnectionStatus;
    serverRevocationAcknowledged: boolean;
  }> => ipcRenderer.invoke("connection:signOut"),
  retry: (): Promise<DesktopConnectionStatus> => ipcRenderer.invoke("connection:retry"),
  switchStaff: (): Promise<DesktopConnectionStatus> => ipcRenderer.invoke("connection:switchStaff"),
});
