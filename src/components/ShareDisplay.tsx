import { FileText, Link2, Download, ExternalLink, Copy, File, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { decrypt, isEncrypted, deriveKeyFromRoomId } from "@/lib/crypto";
import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";

interface ShareDisplayProps {
  share: any;
  encryptionKey: string | null;
  isPasswordKey: boolean;
  canDelete: boolean;
  onDelete: () => void;
  oldEncryptionKeys?: string[]; // Array of old passwords for decrypting old content
  isPasswordProtected?: boolean; // Whether the room is password-protected
  roomId?: string; // Room ID for deriving encryption key in public rooms
}

export function ShareDisplay({ share, encryptionKey, isPasswordKey, canDelete, onDelete, oldEncryptionKeys = [], isPasswordProtected = false, roomId }: ShareDisplayProps) {
  const [decryptedContent, setDecryptedContent] = useState<string>("");
  const [isDecrypting, setIsDecrypting] = useState(true);

  useEffect(() => {
    const decryptData = async () => {
      try {
        if (share.type === "file" && share.file_name) {
          // Check if file name is encrypted
          if (isEncrypted(share.file_name)) {
            // Try decrypting with all available keys (current + old passwords + room ID)
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
            
            // For public rooms: try room ID key if no other keys available
            if (keysToTry.length === 0 && !isPasswordProtected && roomId) {
              try {
                const roomIdKey = await deriveKeyFromRoomId(roomId);
                keysToTry.push({ key: roomIdKey, isPasswordKey: false });
              } catch (error) {
                logger.error("Failed to derive room ID key for file name:", error);
              }
            }

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
            // Try decrypting with all available keys (current + old passwords + room ID)
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
            
            // For public rooms: also try room ID key if not already in keysToTry
            if (!isPasswordProtected && roomId) {
              try {
                const roomIdKey = await deriveKeyFromRoomId(roomId);
                if (!keysToTry.find(k => k.key === roomIdKey)) {
                  keysToTry.push({ key: roomIdKey, isPasswordKey: false });
                }
              } catch (error) {
                console.error("Failed to derive room ID key:", error);
              }
            }

            if (keysToTry.length === 0) {
              // No keys available - try to derive from room ID for public rooms
              if (!isPasswordProtected && roomId) {
                try {
                  const roomIdKey = await deriveKeyFromRoomId(roomId);
                  const decrypted = await decrypt(share.content, roomIdKey, false);
                  if (!isEncrypted(decrypted)) {
                    setDecryptedContent(decrypted);
                    setIsDecrypting(false);
                    return;
                  }
                } catch (error) {
                  console.error("Failed to decrypt with room ID key:", error);
                }
              }
              
              // Check if content is actually encrypted or just looks like it
              const parts = share.content.split(":");
              const looksLikeEncrypted = parts.length === 2 || parts.length === 3;
              const allPartsBase64 = looksLikeEncrypted && parts.every(part => 
                part.length >= 10 && /^[A-Za-z0-9+/=]+$/.test(part)
              );
              
              if (!allPartsBase64 || share.content.length < 30) {
                // Not actually encrypted - likely unencrypted content (legacy), show as-is
                console.warn("Content marked as encrypted but appears unencrypted, showing as-is", {
                  shareId: share.id,
                  shareType: share.type,
                  contentLength: share.content.length,
                  isPasswordProtected
                });
                setDecryptedContent(share.content);
              } else {
                // Actually encrypted but no key available
                console.error("Encrypted content detected but no encryption keys available", {
                  shareId: share.id,
                  shareType: share.type,
                  contentLength: share.content.length,
                  hasColon: share.content.includes(":"),
                  isPasswordProtected,
                  hasRoomId: !!roomId
                });
                
                // Show appropriate error message based on room type
                if (isPasswordProtected) {
                  setDecryptedContent("[⚠️ Unable to decrypt content. Please enter the room password.]");
                } else {
                  // Public room - try room ID key if available
                  setDecryptedContent("[⚠️ Unable to decrypt content. Please refresh the page or contact room creator.]");
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
                  logger.error("Failed to decrypt content with all available keys", {
                    shareId: share.id,
                    shareType: share.type,
                    keysTried: keysToTry.length,
                    lastError: lastError,
                    contentPreview: share.content.substring(0, 100)
                  });
                  // Provide more helpful error message based on room type
                  if (isPasswordProtected) {
                    setDecryptedContent("[⚠️ Unable to decrypt content. Please verify you entered the correct password.]");
                  } else {
                    const hasHashInUrl = window.location.hash.length > 1;
                    if (hasHashInUrl) {
                      setDecryptedContent("[⚠️ Unable to decrypt content. The encryption key in the URL may be invalid. Try copying the room link again from the original source.]");
                    } else {
                      setDecryptedContent("[⚠️ Unable to decrypt content. This content requires an encryption key that is not available. If you created this on another device, the key may have been stored in that device's session.]");
                    }
                  }
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
        logger.error("Unexpected error in decryptData:", error);
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

  // Security: Validate URL is HTTPS only
  const isValidHttpsUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      // Only allow HTTPS protocol (no HTTP, no javascript:, no data:, etc.)
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const makeLinksClickable = (text: string) => {
    // Only match HTTPS URLs (not HTTP) for security
    const urlRegex = /(https:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    
    return (
      <>
        {parts.map((part, index) => {
          if (part.match(urlRegex) && isValidHttpsUrl(part)) {
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
    <div className="space-y-2 sm:space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground min-w-0 flex-1">
          {share.type === "text" && <FileText className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" />}
          {share.type === "code" && <Code className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" />}
          {share.type === "url" && <Link2 className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" />}
          {share.type === "file" && <File className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" />}
          <span className="truncate">{formatDistanceToNow(new Date(share.created_at), { addSuffix: true })}</span>
        </div>
        <Button onClick={copyContent} variant="ghost" size="sm" className="gap-1 sm:gap-2 shrink-0 h-7 sm:h-8 text-xs sm:text-sm">
          <Copy className="w-3 h-3 sm:w-4 sm:h-4" />
          <span className="hidden sm:inline">Copy</span>
        </Button>
      </div>

      {share.type === "code" && (
        <div className="space-y-2 overflow-x-auto">
          <SyntaxHighlighter
            language={extractCodeLanguage(decryptedContent)}
            style={oneDark}
            className="rounded-lg text-xs sm:text-sm"
            customStyle={{ margin: 0, borderRadius: '0.5rem' }}
          >
            {extractCodeContent(decryptedContent)}
          </SyntaxHighlighter>
        </div>
      )}

      {share.type === "text" && (
        <div className="space-y-2">
          <p className="text-sm sm:text-base text-foreground whitespace-pre-wrap bg-background/50 p-3 sm:p-4 rounded-lg break-words">
            {makeLinksClickable(decryptedContent)}
          </p>
        </div>
      )}

      {share.type === "url" && (
        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href={decryptedContent}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-sm sm:text-base text-primary hover:underline break-all min-w-0"
          >
            {decryptedContent}
          </a>
          <Button asChild variant="outline" size="sm" className="shrink-0 h-8 sm:h-9">
            <a href={decryptedContent} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
            </a>
          </Button>
        </div>
      )}

      {share.type === "file" && (
        <div className="space-y-2 sm:space-y-3">
          <div className="flex items-start sm:items-center justify-between gap-2 flex-col sm:flex-row">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm sm:text-base break-words">{decryptedContent || share.file_name}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {share.file_type} • {formatFileSize(share.file_size)}
              </p>
            </div>
            <Button onClick={downloadFile} variant="outline" size="sm" className="gap-1 sm:gap-2 shrink-0 w-full sm:w-auto text-xs sm:text-sm">
              <Download className="w-3 h-3 sm:w-4 sm:h-4" />
              Download
            </Button>
          </div>

          {share.file_type?.startsWith("image/") && (
            <img
              src={share.file_url}
              alt={decryptedContent || share.file_name}
              className="rounded-lg max-h-48 sm:max-h-64 md:max-h-96 w-full object-cover"
            />
          )}
        </div>
      )}
    </div>
  );
}