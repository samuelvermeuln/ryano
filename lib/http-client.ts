import axios, { type AxiosError, type AxiosInstance, type CreateAxiosDefaults } from "axios";

const DEFAULT_HTTP_TIMEOUT_MS = 15000;
const sharedHttpClient = axios.create({
  timeout: DEFAULT_HTTP_TIMEOUT_MS,
  validateStatus: () => true,
});

export function createHttpClient(config?: CreateAxiosDefaults): AxiosInstance {
  return axios.create({
    timeout: DEFAULT_HTTP_TIMEOUT_MS,
    validateStatus: () => true,
    ...config,
  });
}

export function getHttpClient() {
  return sharedHttpClient;
}

export function getAxiosErrorCauseCode(error: AxiosError) {
  const cause = error.cause;

  if (typeof cause === "object" && cause !== null && "code" in cause) {
    return String((cause as { code?: unknown }).code);
  }

  return error.code;
}
