import { rpc } from "@stellar/stellar-sdk";

export interface StellarConfig {
  horizonUrl: string;
  sorobanRpcUrl: string;
  networkPassphrase: string;
  contractId: string;
  simulatorAccount: string;
}

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

let cachedConfig: StellarConfig | null = null;
let cachedRpcServer: rpc.Server | null = null;

export function loadStellarConfig(): StellarConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const {
    HORIZON_URL,
    SOROBAN_RPC_URL,
    SOROBAN_NETWORK_PASSPHRASE,
    CONTRACT_ID,
    SIMULATOR_ACCOUNT
  } = process.env;

  if (
    !HORIZON_URL ||
    !SOROBAN_RPC_URL ||
    !SOROBAN_NETWORK_PASSPHRASE ||
    !CONTRACT_ID ||
    !SIMULATOR_ACCOUNT
  ) {
    throw new Error("Missing Stellar configuration env vars.");
  }

  cachedConfig = {
    horizonUrl: HORIZON_URL,
    sorobanRpcUrl: SOROBAN_RPC_URL,
    networkPassphrase: SOROBAN_NETWORK_PASSPHRASE,
    contractId: CONTRACT_ID,
    simulatorAccount: SIMULATOR_ACCOUNT
  };

  return cachedConfig;
}

export function getStellarRpcServer(): rpc.Server {
  if (cachedRpcServer) {
    return cachedRpcServer;
  }

  const config = loadStellarConfig();
  cachedRpcServer = new rpc.Server(config.sorobanRpcUrl, { allowHttp: true });
  return cachedRpcServer;
}