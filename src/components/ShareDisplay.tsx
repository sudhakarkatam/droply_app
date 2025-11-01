import { FileText, Link2, Download, ExternalLink, Copy, File, Code } from "lucide-react";
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
  oldEncryptionKeys?: string[]; // Array of old passwords for decrypting old content
  isPasswordProtected?: boolean; // Whether the room is password-protected
}

export function ShareDisplay({ share, encryptionKey, isPasswordKey, canDelete, onDelete, oldEncryptionKeys = [], isPasswordProtected = false }: ShareDisplayProps) {
  const [decryptedContent, setDecryptedContent] = useState<string>("");
  const [isDecrypting, setIsDecrypting] = useState(true);

  useEffect(() => {
    const decryptData = async () => {
      try {
        if (share.type === "file" && share.file_name) {
          // Check if file name is encrypted
          if (isEncrypted(share.file_name)) {
            // Try decrypting with all available keys (current + old passwords)
            const keysToTry: { key: string; isPasswordKey: boolean }[] = [];
            
            // Add current encryption key first
            if (encryptionKey) {
              keysToTry.push({ key: encryptionKey, isPasswordKey });
            }
            
            // Add old encryption keys
            oldEncryptionKeys.forEach(oldKey => {
              if (oldKey && !keysToTry.find(k => k.key === oldKey)) {
                keysToTry.push({ key: oldKey, isPasswordKey: true });
              }
            });

            if (keysToTry.length === 0) {
              // No keys available, show original
              setDecryptedContent(share.file_name);
            } else {
              // Try each key until one works
              let decrypted: string | null = null;
              
              for (const { key, isPasswordKey: keyIsPasswordKey } of keysToTry) {
                try {
                  const attempt = await decrypt(share.file_name, key, keyIsPasswordKey);
                  // Check if decryption actually succeeded
                  if (!isEncrypted(attempt)) {
                    decrypted = attempt;
                    break; // Success! Stop trying other keys
                  }
                } catch (error) {
                  // Continue trying other keys
                }
              }

              if (decrypted !== null) {
                setDecryptedContent(decrypted);
              } else {
                // All decryption attempts failed, show original
                setDecryptedContent(share.file_name);
              }
            }
          } else {
            // Not encrypted, show as-is
            setDecryptedContent(share.file_name);
          }
        } else if (share.content) {
          // Check if content is encrypted
          if (isEncrypted(share.content)) {
            // Try decrypting with all available keys (current + old passwords)
            const keysToTry: { key: string; isPasswordKey: boolean }[] = [];
            
            // Add current encryption key first
            if (encryptionKey) {
              keysToTry.push({ key: encryptionKey, isPasswordKey });
            }
            
            // Add old encryption keys
            oldEncryptionKeys.forEach(oldKey => {
              if (oldKey && !keysToTry.find(k => k.key === oldKey)) {
                keysToTry.push({ key: oldKey, isPasswordKey: true });
              }
            });

            if (keysToTry.length === 0) {
              // No keys available - check if content is actually encrypted or just looks like it
              // For public rooms without passwords, content is stored unencrypted
              // If isEncrypted returned true but no key is available, it might be a false positive
              
              // Check if this looks like unencrypted content that was misidentified
              const parts = share.content.split(":");
              const looksLikeEncrypted = parts.length === 2 || parts.length === 3;
              const allPartsBase64 = looksLikeEncrypted && parts.every(part => 
                part.length >= 10 && /^[A-Za-z0-9+/=]+$/.test(part)
              );
              
              if (!allPartsBase64 || share.content.length < 30) {
                // Not actually encrypted - likely unencrypted content, show as-is
                // This is normal for public rooms without passwords
                console.warn("Content marked as encrypted but appears unencrypted, showing as-is", {
                  shareId: share.id,
                  shareType: share.type,
                  contentLength: share.content.length,
                  isPasswordProtected
                });
                setDecryptedContent(share.content);
              } else if (!isPasswordProtected && !encryptionKey) {
                // Public room with no encryption key - content should be unencrypted
                // Even if it looks encrypted, for public rooms we should try to show it
                console.warn("Public room: Content appears encrypted but no key available, treating as unencrypted", {
                  shareId: share.id
                });
                setDecryptedContent(share.content);
              } else {
                // Actually encrypted but no key available
                console.error("Encrypted content detected but no encryption keys available", {
                  shareId: share.id,
                  shareType: share.type,
                  contentLength: share.content.length,
                  hasColon: share.content.includes(":"),
                  isPasswordProtected
                });
                
                // Show appropriate error message based on room type
                if (isPasswordProtected) {
                  setDecryptedContent("[⚠️ Unable to decrypt content. Please enter the room password.]");
                } else {
                  // Public room - content shouldn't be encrypted, but it is
                  // This might be old content or an error - try to show as-is
                  setDecryptedContent("[⚠️ Unable to decrypt content. This may be encrypted content from a previous password-protected state.]");
                }
              }
            } else {
              // Try each key until one works
              let decrypted: string | null = null;
              let lastError: any = null;
              
              for (const { key, isPasswordKey: keyIsPasswordKey } of keysToTry) {
                try {
                  const attempt = await decrypt(share.content, key, keyIsPasswordKey);
                  // Check if decryption actually succeeded (result should not be encrypted)
                  if (!isEncrypted(attempt)) {
                    decrypted = attempt;
                    break; // Success! Stop trying other keys
                  }
                } catch (error) {
                  lastError = error;
                  // Continue trying other keys
                }
              }

              if (decrypted !== null) {
                setDecryptedContent(decrypted);
              } else {
                // All decryption attempts failed
                // Check if content might actually be unencrypted (false positive from isEncrypted check)
                // This can happen if content contains ':' but isn't actually encrypted
                const parts = share.content.split(":");
                const mightBeUnencrypted = parts.length === 2 && 
                  (parts[0].length < 20 || parts[1].length < 20) &&
                  !parts[0].match(/^[A-Za-z0-9+/=]+$/) && // Not base64-like
                  !parts[1].match(/^[A-Za-z0-9+/=]+$/);
                
                if (mightBeUnencrypted) {
                  // Likely unencrypted text with ':' separator, show as-is
                  console.warn("Decryption failed but content might be unencrypted", {
                    shareId: share.id,
                    content: share.content.substring(0, 50)
                  });
                  setDecryptedContent(share.content);
                } else {
                  // Genuine encryption failure
                  console.error("Failed to decrypt content with all available keys", {
                    shareId: share.id,
                    shareType: share.type,
                    keysTried: keysToTry.length,
                    lastError: lastError,
                    contentPreview: share.content.substring(0, 100)
                  });
                  setDecryptedContent("[⚠️ Unable to decrypt content. Please check your password or refresh the page.]");
                }
              }
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
  }, [share.content, share.file_name, share.type, encryptionKey, isPasswordKey, oldEncryptionKeys]);

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

  const makeLinksClickable = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    
    return (
      <>
        {parts.map((part, index) => {
          if (part.match(urlRegex)) {
            return (
              <a
                key={index}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all"
              >
                {part}
              </a>
            );
          }
          return <span key={index}>{part}</span>;
        })}
      </>
    );
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
          {share.type === "code" && <Code className="w-4 h-4" />}
          {share.type === "url" && <Link2 className="w-4 h-4" />}
          {share.type === "file" && <File className="w-4 h-4" />}
          <span>{formatDistanceToNow(new Date(share.created_at), { addSuffix: true })}</span>
        </div>
        <Button onClick={copyContent} variant="ghost" size="sm" className="gap-2">
          <Copy className="w-4 h-4" />
          Copy
        </Button>
      </div>

      {share.type === "code" && (
        <div className="space-y-2">
          <SyntaxHighlighter
            language={extractCodeLanguage(decryptedContent)}
            style={oneDark}
            className="rounded-lg text-sm"
          >
            {extractCodeContent(decryptedContent)}
          </SyntaxHighlighter>
        </div>
      )}

      {share.type === "text" && (
        <div className="space-y-2">
          <p className="text-foreground whitespace-pre-wrap bg-background/50 p-4 rounded-lg">
            {makeLinksClickable(decryptedContent)}
          </p>
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