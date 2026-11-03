import type { TerminalEnrollmentStatus } from "../../preload/index";

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
  }
}

export {};
