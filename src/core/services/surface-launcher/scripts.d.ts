// src/core/services/surface-launcher/scripts.d.ts
declare module "*.ps1?raw" {
  const content: string;
  export default content;
}

declare module "*.sh?raw" {
  const content: string;
  export default content;
}

declare module "*.applescript?raw" {
  const content: string;
  export default content;
}
