import { FileText, Link2, Download, ExternalLink, Copy, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { decrypt, isEncrypted } from "@/lib/crypto";
import { useEffect, useState } from "react";

interface ShareDisplayProps {
  share: any;
  encryptionKey: string | null;
  isPasswordKey: boolean;
  canDelete: boolean;
  onDelete: () => void;
}

export function ShareDisplay({ share, encryptionKey, isPasswordKey, canDelete, onDelete }: ShareDisplayProps) {
  const [decryptedContent, setDecryptedContent] = useState<string>("");
  const [isDecrypting, setIsDecrypting] = useState(true);

  useEffect(() => {
    const decryptData = async () => {
      try {
        if (share.type === "file" && share.file_name) {
          // Check if file name is encrypted
          if (isEncrypted(share.file_name) && encryptionKey) {
            try {
              const decrypted = await decrypt(share.file_name, encryptionKey, isPasswordKey);
              // Check if decryption actually succeeded
              if (isEncrypted(decrypted)) {
                // Decryption failed - result is still encrypted
                console.error("Decryption failed for file name - result still encrypted");
                setDecryptedContent(share.file_name); // Show original encrypted name as fallback
              } else {
                setDecryptedContent(decrypted);
              }
            } catch (error) {
              console.error("Failed to decrypt file name:", error);
              // If decryption fails, show original (might be unencrypted or wrong key)
              setDecryptedContent(share.file_name);
            }
          } else {
            // Not encrypted, show as-is
            setDecryptedContent(share.file_name);
          }
        } else if (share.content) {
          // Check if content is encrypted
          if (isEncrypted(share.content) && encryptionKey) {
            try {
              const decrypted = await decrypt(share.content, encryptionKey, isPasswordKey);
              // Check if decryption actually succeeded (result should not be encrypted)
              if (isEncrypted(decrypted)) {
                // Decryption failed - result is still encrypted
                console.error("Decryption failed - result still encrypted");
                setDecryptedContent("[⚠️ Unable to decrypt content. Please check your password or refresh the page.]");
              } else {
                setDecryptedContent(decrypted);
              }
            } catch (error) {
              console.error("Failed to decrypt content:", error);
              // If decryption fails, show error message instead of encrypted key
              setDecryptedContent("[⚠️ Unable to decrypt content. Please check your password or refresh the page.]");
            }
          } else {
            // Not encrypted, show as-is
            setDecryptedContent(share.content);
          }
        } else {
          setDecryptedContent("");
        }
      } catch (error) {
        console.error("Unexpected error in decryptData:", error);
        setDecryptedContent(share.content || share.file_name || "");
      } finally {
        setIsDecrypting(false);
      }
    };
    decryptData();
  }, [share.content, share.file_name, share.type, encryptionKey, isPasswordKey]);

  const copyContent = () => {
    navigator.clipboard.writeText(decryptedContent || share.file_url);
    toast.success("Copied to clipboard!");
  };

  const downloadFile = async () => {
    if (share.file_url) {
      try {
        const response = await fetch(share.file_url);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = share.file_name || "download";
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success("Download started!");
      } catch (error) {
        console.error("Download failed:", error);
        toast.error("Failed to download file");
      }
    }
  };

  const isCodeSnippet = (content: string) => {
    return content.startsWith("```") && content.includes("\n") && content.endsWith("```");
  };

  const extractCodeLanguage = (content: string) => {
    const match = content.match(/^```(\w+)\n/);
    return match ? match[1] : "javascript";
  };

  const extractCodeContent = (content: string) => {
    return content.replace(/^```\w+\n/, "").replace(/\n```$/, "");
  };

  if (isDecrypting) {
    return (
      <div className="flex items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">Decrypting...</p>
      </div>
    );
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {share.type === "text" && <FileText className="w-4 h-4" />}
          {share.type === "url" && <Link2 className="w-4 h-4" />}
          {share.type === "file" && <File className="w-4 h-4" />}
          <span>{formatDistanceToNow(new Date(share.created_at), { addSuffix: true })}</span>
        </div>
        <Button onClick={copyContent} variant="ghost" size="sm" className="gap-2">
          <Copy className="w-4 h-4" />
          Copy
        </Button>
      </div>

      {share.type === "text" && (
        <div className="space-y-2">
          {isCodeSnippet(decryptedContent) ? (
            <SyntaxHighlighter
              language={extractCodeLanguage(decryptedContent)}
              style={oneDark}
              className="rounded-lg text-sm"
            >
              {extractCodeContent(decryptedContent)}
            </SyntaxHighlighter>
          ) : (
            <p className="text-foreground whitespace-pre-wrap bg-background/50 p-4 rounded-lg">
              {decryptedContent}
            </p>
          )}
        </div>
      )}

      {share.type === "url" && (
        <div className="flex items-center gap-3">
          <a
            href={decryptedContent}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-primary hover:underline break-all"
          >
            {decryptedContent}
          </a>
          <Button asChild variant="outline" size="sm">
            <a href={decryptedContent} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
        </div>
      )}

      {share.type === "file" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{decryptedContent || share.file_name}</p>
              <p className="text-sm text-muted-foreground">
                {share.file_type} • {formatFileSize(share.file_size)}
              </p>
            </div>
            <Button onClick={downloadFile} variant="outline" size="sm" className="gap-2">
              <Download className="w-4 h-4" />
              Download
            </Button>
          </div>

          {share.file_type?.startsWith("image/") && (
            <img
              src={share.file_url}
              alt={decryptedContent || share.file_name}
              className="rounded-lg max-h-96 w-full object-cover"
            />
          )}
        </div>
      )}
    </div>
  );
}