// src/renderer/src/utils/file-utils.ts

export const getFileIcon = (fileName: string, isDirectory: boolean, isExpanded = false): string => {
  if (isDirectory) {
    return isExpanded ? "folder-open" : "folder";
  }

  // TODO: Legacy, to be removed
  if (fileName.endsWith(".chat.json")) {
    return "chat-dots";
  }

  if (fileName.endsWith(".prompt.md")) {
    return "chat-dots";
  }

  // Determine icon based on file extension
  const extension = fileName.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "ts":
    case "tsx":
      return "file-code";
    case "js":
    case "jsx":
      return "file-code";
    case "json":
      return "file-earmark-code";
    case "md":
      return "file-earmark-text";
    case "html":
      return "file-earmark-code";
    case "css":
      return "file-earmark-code";
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
      return "file-earmark-image";
    case "pdf":
      return "file-earmark-pdf";
    case "zip":
    case "tar":
    case "gz":
      return "file-earmark-zip";
    default:
      return "file-earmark";
  }
};

export const isImageFile = (fileName: string): boolean => {
  const imageExtensions = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".webp",
    ".bmp",
  ];
  return imageExtensions.some((ext) => fileName.toLowerCase().endsWith(ext));
};

export const isBinaryFile = (fileType: string): boolean => {
  const binaryTypes = ["image", "pdf", "archive"];
  return binaryTypes.includes(fileType);
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};
