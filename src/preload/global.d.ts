import type { MnemonicApi } from "./preload.cjs";

declare global {
  interface Window {
    mnemonic: MnemonicApi;
  }
}

export {};
