export type PublicEnv = {
  appName: string;
  appEnv: "local" | "development" | "staging" | "production";
  appUrl: string;
  apiUrl: string;
};
