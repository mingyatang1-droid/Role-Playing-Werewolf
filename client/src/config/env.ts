export interface ClientEnvironment {
  apiBaseUrl: string;
  socketUrl: string;
}

const developmentEnvironment: ClientEnvironment = {
  apiBaseUrl: "http://127.0.0.1:3000",
  socketUrl: "ws://127.0.0.1:3000/v1/ws",
};

export function getClientEnvironment(): ClientEnvironment {
  return developmentEnvironment;
}
