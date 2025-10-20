// src/core/services/surface-launcher/applescript.d.ts
declare module "*.applescript?raw" {
  const source: string;
  export default source;
}

declare module "*.ps1?raw" {
  const source: string;
  export default source;
}

declare module "*.sh?raw" {
  const source: string;
  export default source;
}
