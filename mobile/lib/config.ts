import Constants from "expo-constants";

export const API_URL: string =
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? "https://mesto-go.ru";

export const TICKET_SANDBOX = Constants.expoConfig?.extra?.ticketSandbox === true;

export function sessionKey(name: string): string {
  return TICKET_SANDBOX ? `${name}_ticket_test` : name;
}
