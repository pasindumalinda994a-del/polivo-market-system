import type {
  ConfigureHostResult,
  DesktopConnectionStatus,
  TerminalEnrollmentStatus,
} from "../../preload/index";

export {};

declare global {
  interface Window {
    polivoEnrollment?: {
      getStatus: () => Promise<TerminalEnrollmentStatus>;
      enrollTerminal: (input: {
        enrollmentSecret: string;
        enrollmentBaseUrl: string;
        deploymentEnvironment: "development" | "staging" | "production";
        hostServiceBaseUrl: string;
      }) => Promise<TerminalEnrollmentStatus>;
    };
    polivoConnection?: {
      getStatus: () => Promise<DesktopConnectionStatus>;
      configureOrTestHost: (input: {
        hostAddress: string;
        port?: number;
      }) => Promise<ConfigureHostResult>;
      signIn: (input: { staffCode: string; secret: string }) => Promise<DesktopConnectionStatus>;
      getSession: () => Promise<DesktopConnectionStatus>;
      signOut: () => Promise<{
        status: DesktopConnectionStatus;
        serverRevocationAcknowledged: boolean;
      }>;
      retry: () => Promise<DesktopConnectionStatus>;
      switchStaff: () => Promise<DesktopConnectionStatus>;
    };
  }
}
