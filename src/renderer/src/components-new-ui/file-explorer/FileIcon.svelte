<!-- src/renderer/src/components-new-ui/file-explorer/FileIcon.svelte -->
<script lang="ts">
  import {
    ChatDots,
    Folder,
    Folder2Open,
    FileEarmark,
    FileEarmarkCode,
    FileEarmarkText,
    FileEarmarkImage,
    FileEarmarkPdf,
    FileEarmarkZip,
  } from "svelte-bootstrap-icons";

  interface FileIconProps {
    fileName: string;
    isDirectory: boolean;
    isExpanded?: boolean;
    size?: string;
    className?: string;
  }

  let {
    fileName,
    isDirectory,
    isExpanded = false,
    size = "text-sm",
    className = "",
  }: FileIconProps = $props();

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  function getIconComponent() {
    if (isDirectory) {
      return isExpanded ? Folder2Open : Folder;
    }

    if (fileName.endsWith(".chat.json")) {
      return ChatDots;
    }

    const extension = fileName.split(".").pop()?.toLowerCase();

    switch (extension) {
      case "ts":
      case "tsx":
      case "js":
      case "jsx":
      case "html":
      case "css":
      case "json":
        return FileEarmarkCode;
      case "md":
      case "txt":
        return FileEarmarkText;
      case "png":
      case "jpg":
      case "jpeg":
      case "gif":
      case "svg":
      case "webp":
      case "bmp":
        return FileEarmarkImage;
      case "pdf":
        return FileEarmarkPdf;
      case "zip":
      case "tar":
      case "gz":
        return FileEarmarkZip;
      default:
        return FileEarmark;
    }
  }

  const IconComponent = getIconComponent();
</script>

<IconComponent class="{size} text-muted {className}" />